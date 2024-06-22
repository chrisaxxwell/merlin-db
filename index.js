import { MerlinError } from "./errors.js";
import Query, { ObjectId } from "./query.js";

function MerlinDB() {
   if (!(this instanceof MerlinDB)) {
      return new MerlinDB();
   };
   /**@protected */
   this.models = [];
   /**@protected */
   this.dbApi = window.indexedDB;
};

function Schema(schema) {
   schema = schema || {};
   return schema;
}

function setSchema(schema, model, t) {
   if (!model) return;

   Object.entries(schema).forEach(e => {
      e[ 1 ] = e[ 1 ].unique || false;
      if (e[ 0 ] == "id_") return;
      model.createIndex(e[ 0 ], e[ 0 ], { unique: e[ 1 ] });
   });
   model.createIndex("id_", "id_", { unique: true });
   model.createIndex("$order", "$order", { unique: true });
}

function isModel(db, modelName) {
   return db.objectStoreNames.contains(modelName);
}

MerlinDB.prototype.model = function (modelName, schema) {

   return new Query(schema, this, modelName);
};

MerlinDB.prototype.version = function (dbName) {
   return new Promise(resolve => {
      var db = this.dbApi.open(dbName || this.dbName);

      db.onsuccess = e => {
         var result = e.target.result;

         resolve(result.version);
         result.close()
      }
   })
};
/**@private */
MerlinDB.prototype.dbOpen = function () {
   return new Promise(resolve => {
      var db = this.dbApi.open(this.dbName);

      db.onsuccess = e => {
         var result = e.target.result;
         resolve(result);
      }
   })
};

//Connect
MerlinDB.prototype.connect = function (dbName) {
   var t = this;
   /**@protected */
   t.dbName = dbName;

   return new Promise((resolve, reject) => {
      t.open = t.dbApi.open(t.dbName);
      t.open.onsuccess = (e) => {
         var db = e.target.result;
         resolve({ status: 200, message: "Database connected" })
         db.close();
      }

      t.open.onerror = (err) => {
         reject({ status: 400, message: err })
      }
   })
};

//Drop Database
MerlinDB.prototype.dropDatabase = function (dbName) {
   var t = this;
   return new Promise(async (resolve, reject) => {

      var databases = await t.dbApi.databases(dbName);
      databases = Object.values(databases);

      var isDb = new Promise(resolve => {

         for (const key of databases) {
            if (key.name === dbName) {
               return resolve(true);
            }
         }

         resolve(false);
      });

      if (!(await isDb)) {
         return reject({
            status: 400,
            message: `There's no '${dbName}' database!`
         });
      }

      var db = t.dbApi.deleteDatabase(dbName);

      db.onsuccess = (e) => {
         resolve({
            status: 200,
            message: "Database deleted successfully"
         });
      };
   });
}

/**
 * @typedef {Object} DatabaseSize
 * @property {("kB"|"MB"|"GB")} format - 
 * @property {Boolean} string - 
 * @param {DatabaseSize} options 
 * @returns 
 */
MerlinDB.prototype.databaseSize = function (options) {
   options = options || {};

   return new Promise((resolve, reject) => {
      var open = this.dbApi.open(this.dbName);
      var size = 0;

      open.onsuccess = (e) => {
         var result = e.target.result;
         var stores = Object.values(result.objectStoreNames);

         if (stores.length === 0) {
            result.close();
            return resolve(0);
         }

         stores.forEach((key, idx) => {
            var trans = result.transaction([ key ], 'readonly');
            var store = trans.objectStore(key);

            store.getAll().onsuccess = e => {

               e.target.result.forEach(e => {

                  size += JSON.stringify(e).length;
               });

               if (idx === stores.length - 1) {

                  if (options.format) {
                     size = new Query().formatDataSize(
                        size,
                        options,
                     );
                     if (!size[ 1 ]) {
                        return resolve(size[ 0 ])
                     }

                     resolve(size[ 0 ] + size[ 1 ]);
                     return;
                  }

                  resolve(size);
               }

               result.close();
            };
         });
      }
   });
}

/**
 * @typedef {Object} EstimatedSize
 * @property {("kB"|"MB"|"GB")} format - 
 * @property {Boolean} string - 
 * @property {("en-US"|"pt-BR")} locale - or you country locale lang
 * @param {EstimatedSize} options 
 * @returns 
 */
MerlinDB.prototype.getMemInfo = function (options) {
   options = options || {};

   var nav = window.navigator;

   return new Promise((resolve, reject) => {
      if (nav.storage && nav.storage.estimate) {

         nav.storage.estimate().then(estimate => {
            var sizes = {
               total: estimate.quota,
               used: estimate.usage,
            };
            sizes.remainder = sizes.total - sizes.used;

            if (options.format) {

               for (const key in sizes) {
                  sizes[ key ] = new Query().formatDataSize(
                     sizes[ key ],
                     options
                  )

                  if (options.string) {
                     sizes[ key ] = sizes[ key ][ 0 ] + sizes[ key ][ 1 ]

                  } else {
                     sizes[ key ] = sizes[ key ][ 0 ]

                  }
               }

               return resolve(sizes);
            }
            resolve(sizes);
         });

      } else {
         reject('There\'s no StorageManager API.');
      }
   });
}

/**
 * 
 * @param {Array} exceptions - ['dbs-to-not-drop']
 * @returns 
 */
MerlinDB.prototype.dropAll = function (exceptions) {
   exceptions = exceptions || [];
   var count = 0;
   var deletedCount = 0;
   var databasesDeleted = [];

   return new Promise(async (resolve, reject) => {

      var databases = await this.dbApi.databases();

      if (databases.length === 0) {
         return resolve({
            deleteDbCount: 0,
            hasDatabase: "NO"
         });
      }

      databases.forEach(async e => {
         count++;

         if (exceptions.indexOf(e.name) === -1) {
            databasesDeleted.push(e.name);
            deletedCount++;
            this.dropDatabase(e.name);

            if (databases.length === count) {
               resolve({
                  deleteDbCount: deletedCount,
                  status: 200,
                  databasesDeleted: databasesDeleted
               })
            }
         }
      });

   });
}

MerlinDB.prototype.info = function (options) {
   options = options || {};

   return new Promise(async (resolve, reject) => {
      var info = {
         estimatedSize: await this.databaseSize(options.sizes),
         merlinDB: {
            databases: await this.dbApi.databases(),
            models: await this.getModels()
         }
      }
      resolve(info);
   });
}

//Delete Model
MerlinDB.prototype.createModel = function (modelName, schema) {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = this.dbApi.open(this.dbName, version + 1);

      db.onupgradeneeded = e => {
         var result = e.target.result;
         if (result.objectStoreNames.contains(modelName)) {
            reject(`model '${modelName}' already exists!`);
            return result.close();
         }

         var model = result.createObjectStore(modelName, { keyPath: 'id_' });
         setSchema(schema, model);

         this.getModel(modelName).then(info => {
            resolve({
               status: 200,
               message: `Model '${modelName}' created!`,
               modelInfo: info
            })
         })
         result.close();
      }
   });
};

//Delete Model
MerlinDB.prototype.deleteModel = function (modelName) {
   var t = this;

   return new Promise((resolve, reject) => {
      t.dbApi.open(t.dbName).onsuccess = (e) => {
         var db = e.target.result;
         var version = db.version + 1;

         if (!isModel(db, modelName)) {
            db.close();
            reject(`'${modelName}' model not found!`);
            return;
         }

         db.close();

         var req = t.dbApi.open(t.dbName, version);

         req.onupgradeneeded = function (e) {
            db = e.target.result;
            db.deleteObjectStore(modelName);
         };

         req.onsuccess = e => {
            e.target.result.close();
            t.dbApi.open(t.dbName).onsuccess = e => {
               e.target.result.close()
               resolve(`${modelName} was deleted!`);
            }
         }

         req.onerror = e => {
            reject(`'${modelName}' model not found!`)
         };

         db.close()
      }
   })
};

//Rename Model
MerlinDB.prototype.renameModel = function (modelName, renamed, options) {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var result = await this.dbOpen(this.dbName);

      if (!result.objectStoreNames.contains(modelName)) {
         return reject(`There's no model '${modelName}' in your database!`);
      }

      var trans = result.transaction([ modelName ], 'readwrite');
      var store = trans.objectStore(modelName);
      var recovery = {};
      recovery.index = store.indexNames;

      store.getAll().onsuccess = e => {
         recovery.data = e.target.result
      }

      result.close();

      var db = this.dbApi.open(this.dbName, version + 1);
      var Schema = {};

      db.onupgradeneeded = async e => {
         var result = e.target.result;

         if (result.objectStoreNames.contains(renamed)) {
            result.close();
            return reject(`'${renamed} already exists!'`);
         }

         Object.values(recovery.index).forEach(e => {
            Schema[ e ] = {};

            if (options && options.unique.indexOf(e) !== -1) {
               Schema[ e ].unique = true;
            }
         })

         var model = result.createObjectStore(renamed, { keyPath: 'id_' });
         setSchema(Schema, model);

         result.close();

         var result = await this.dbOpen(this.dbName);
         var trans = result.transaction([ renamed ], 'readwrite');
         var store = trans.objectStore(renamed);

         recovery.data.forEach(item => {
            store.add(item);
         });
         result.close();

         this.deleteModel(modelName);
         resolve({
            oldModel: modelName,
            newModel: renamed,
            renamed: true,
            status: 'Successful'
         })
      }
   });
}

//Get Models
MerlinDB.prototype.getModels = function () {
   var t = this;
   return new Promise(async (resolve, reject) => {
      var db = await this.dbApi.open(this.dbName);
      var models = [];

      db.onsuccess = (e) => {
         var result = e.target.result;
         var modelName = Object.values(result.objectStoreNames);

         if (modelName.length === 0) {
            result.close();
            resolve({ modelsCount: 0, anyModel: "NO" })
            return
         }

         modelName.forEach(model => {

            var trans = result.transaction([ model ], 'readonly');
            var store = trans.objectStore(model);
            var index = store.index('id_');
            var all = index.getAll();
            var size = 0;
            var records = 0;

            all.onsuccess = f => {
               f.target.result.forEach(e => {
                  size += JSON.stringify(e).length;
                  records++;
               });

               models.push({
                  name: model,
                  indexes: Object.values(store.indexNames),
                  size: size + " bytes",
                  records: records
               })
            }

            trans.oncomplete = e => {
               resolve(models);
            }
         });


         result.close();
      };
   });
}

//Get Model
MerlinDB.prototype.getModel = function (modelName) {
   var t = this;

   if (typeof modelName !== 'string') {
      throw new MerlinError(`Define an string with your modelName`);
   }

   return new Promise(async (resolve, reject) => {
      var db = await this.dbApi.open(this.dbName);

      db.onsuccess = (e) => {
         var result = e.target.result;

         if (!result.objectStoreNames.contains(modelName)) {
            result.close();
            return reject(`There's no '${modelName}' model in your Database!`);
         }

         var trans = result.transaction([ modelName ], 'readonly');
         var store = trans.objectStore(modelName);
         var index = store.index('id_');
         var all = index.getAll();
         var size = 0;
         var records = 0;

         all.onsuccess = f => {
            f.target.result.forEach(e => {
               size += JSON.stringify(e).length;
               records++;
            });

            resolve({
               name: modelName,
               indexes: Object.values(store.indexNames),
               size: size + " bytes",
               records: records
            });
         }

         result.close();
      };
   });
}

MerlinDB.prototype.Schema = Schema;
export default MerlinDB;
export {
   Schema,
   ObjectId
}




