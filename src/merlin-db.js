import { MerlinError } from "./errors.js";
import Query, { ObjectId } from "./query.js";
/**
 * Welcome to MerlinDB, it's a pleasure to have you here;
 * 
 * Access https://merlindb.chrisaxxwell.com see the `documentation`;
 * 
 * Basic tutorial in 4 steps:
 * 
 * 1: const db = new MerlinDB();
 * 
 * 2: db.connect(&lt;your-db-name>);
 * 
 * 3: const model = db.model(&lt;modelName>, &lt;schema>); 
 * 
 * 4: model.insert(&lt;data>) | model.find(&lt;query>) | ... returns an promise;
 * 
 * @constructor
 * @returns MerlinDB constructor
 */
function MerlinDB() {
   if (!(this instanceof MerlinDB)) {
      return new MerlinDB();
   };
   /**@protected */
   this.models = [];
   /**@protected */
   this.dbApi = window.indexedDB;
};

/** 
 * Creates a new Schema for the model;
 * @typedef {Object} Schema
 * @property {(Function|Array)} type - Allowed data types (String|Number|Array|Object|Date|Boolean|Function);
 * @property {(Boolean|Function)} required - Ensures that a field is mandatory;
 * @property {Boolean} unique -  Ensures that the value of a field is unique;
 * @property {(Array|Number)} maxLength - Defines the maximum number of characters for a field;
 * @property {(Array|Number)} minLength - Defines the minimum number of characters for a field;
 * @property {(Array|Number)} min - Define a minimum value allowed for a numeric field;
 * @property {(Array|Number)} max - Define a maximum value allowed for a numeric field;
 * @property {(Array|Number)} maxList - Define a maximum value of indices in an array;
 * @property {(Array|Number)} minList - Define a minimum value of indices in an array;
 * @property {(Array|Boolean)} validateEmail - Validate a field of type email;
 * @property {Object} enum - Define a restricted set of possible values ​​for a field;
 * @property {Array} enum.values - Allowed values;
 * @property {String} enum.message - define any message or ignore;
 * @property {Object} encrypt -  Encrypts values ​​of a field with AES in MerlinDB;
 * @property {("SHA-256"|"SHA-384"|"SHA-512")} encrypt.hash - It is a function that transforms an input (or "message") into a fixed output;
 * @property {Number} encrypt.salt -  Is a random value added to the input of a hash function to ensure that the output (the hash) is unique, even if the original input (e.g. a password) is the same;
 * @property {Number} encrypt.iterations - Refers to the number of times a hash function is applied in a key derivation process (e.g. PBKDF2);
 * @property {("medium"|"strict"|"high"|"strong"|"stronger"|"galaxy")} encrypt.strength - Defines the strength of encryption;
 * @property {Object} validate - Validate documents with specific rules in MerlinDB.
 * @property {Function} validate.validator - The function that performs the validation;
 * @property {(String|Function)} validate.message - Error message to validate;
 * @typedef {Object.<string, Schema>} SchemaMerlin 
 * @param {SchemaMerlin} schema - Define the structure of documents within a collection;
 * @returns Structure Schema
 */
function Schema(schema) {
   schema = schema || {};
   return schema;
};

function setSchema(schema, model) {
   if (!model) return;

   Object.entries(schema).forEach(e => {
      e[ 1 ] = e[ 1 ].unique || false;
      if (e[ 0 ] == "id_") return;
      model.createIndex(e[ 0 ], e[ 0 ], { unique: e[ 1 ] });
   });

   model.createIndex("id_", "id_", { unique: true });
   model.createIndex("$order", "$order", { unique: true });
};

function isModel(db, modelName) {
   return db.objectStoreNames.contains(modelName);
};
/**  
 * Creates a new model for your collection;
 * @param {SchemaMerlin} schema - Define the structure of documents within a collection;
 * @param {String} modelName - Define an model name
 * @returns A new model
 */
MerlinDB.prototype.model = function (modelName, schema) {
   if (!schema) {
      throw new MerlinError("Define an Schema");
   }

   return new Query(schema, this, modelName);
};

/**
 * Retrieves the current version of your database
 * @param {String} dbName - Your database Name;
 * @returns Database version (Number)
 */
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

/**
 * Connect to your database;
 * @param {String} dbName - Define a Database name, If it does not exist, one will be automatically created with the name;
 * @returns Database connection
 */
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

/**
 * Delete a database
 * @param {String} dbName - Database name to drop
 * @returns Success if deleted
 */
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
};

/**
 * Get the current database size.
 * @typedef {Object} DatabaseSize
 * @property {("kB"|"MB"|"GB")} format -(Optional) Format to returns. By default, MerlinDB returns all sizes in bytes.
 * @property {Boolean} string - (Optional) If you want to format the value to a string, set true;
 * @param {DatabaseSize} options - Setting options; 
 * @returns Current size of the database in bytes
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
};

/**
 * Get memory information from the database.
 * @typedef {Object} EstimatedSize
 * @property {("kB"|"MB"|"GB")} format -(Optional) Format to returns. By default, MerlinDB returns all sizes in bytes.
 * @property {Boolean} string - (Optional) If you want to format the value to a string, set true;
 * @property {("en-US"|"pt-BR")} locale - Set the locale to format the string. ("en-US" ...);
 * @param {EstimatedSize} options - Setting options; 
 * @returns returns the total size, the used size and the available size of the database in bytes or formatted.
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
         reject("There's no StorageManager API.");
      }
   });
};

/**
 * Deletes all databases.
 * @param {Array} exceptions - ['dbs-to-not-drop'] 
 * @returns Removes all existing databases in MerlinDB.
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
};

/**
 * Get all information from MerlinDB.
 * @typedef {Object} info_
 * @property {("kB"|"MB"|"GB")} format -(Optional) Format to returns. By default, MerlinDB returns all sizes in bytes.
 * @property {Boolean} string - (Optional) If you want to format the value to a string, set true;
 * @property {("en-US"|"pt-BR")} locale - Set the locale to format the string. ("en-US" ...);
 * @param {info_} options - Setting options;  
 * @returns Information such as total estimated memory used (estimatedSize), all databases and all existing models.
 */
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
};

/**  
 * Creates a new model for future operations in MerlinDB.
 * @param {SchemaMerlin} schema - Define the structure of documents within a collection;
 * @param {String} modelName - Define an model name
 * @returns A new model created
 */
MerlinDB.prototype.createModel = function (modelName, schema) {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = this.dbApi.open(this.dbName, version + 1);

      db.onupgradeneeded = e => {
         var result = e.target.result;
         if (result.objectStoreNames.contains(modelName)) {
            reject(`'${modelName}' model already exists!`);
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

/**  
 * Delete an existing model in the database.
 * @param {String} modelName - Model name to delete
 * @returns Success if deleted.
 */
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

/** 
 * Rename a model that already exists in the database.
 * @param {SchemaMerlin} schema - The schema of your current model;
 * @param {String} actualName - Current name of the model;
 * @param {String} rename - Name you want to rename; 
 * @returns renamed model;
 */
MerlinDB.prototype.renameModel = function (actualName, rename, schema) {

   if (typeof schema !== 'object' || Array.isArray(schema) || !schema) {
      throw new MerlinError(`Please define your 'actual schema' in renameModel method!`);
   }

   return new Promise(async (resolve, reject) => {

      var model = this.model(actualName, schema);

      try {
         await this.getModel(actualName);
      } catch (e) {
         return reject(e);
      }


      try {
         await this.createModel(rename, schema);
      } catch (e) {
         return reject(e);
      }

      var data = await model.find();

      var newModel = this.model(rename, schema);
      newModel = await newModel.insert(data);

      this.deleteModel(actualName);
      resolve({
         oldModel: actualName,
         newModel: rename,
         renamed: true,
         data: newModel.data,
         status: 'Successful'
      })
   });
};

/**
 * Getting all models from the database;
 * @returns All models in database;
 */
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
            reject({ modelsCount: 0, anyModel: "NO" })
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
};

/**
 * Get a specific database model.
 * @param {String} modelName - Model name to get;
 * @returns model if exists;
 */
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
};

MerlinDB.prototype.Schema = Schema;

export {
   Schema,
   ObjectId,
   MerlinDB
}




