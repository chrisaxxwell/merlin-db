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

//Schema && Model
function setSchema(schema, model, t) {
   if (!model) return;

   Object.entries(schema).forEach(e => {
      e[ 1 ] = e[ 1 ].unique || false;
      if (e[ 0 ] == "id_") return;
      model.createIndex(e[ 0 ], e[ 0 ], { unique: e[ 1 ] });
   });
   model.createIndex("id_", "id_", { unique: true });
}

function isModel(db, modelName) {
   return db.objectStoreNames.contains(modelName);
}

function createModel(t, d, e) {
   var db = e.target.result;
   if (isModel(db, d.modelName)) return db.close();
   var model = db.createObjectStore(d.modelName, { keyPath: 'id_' });
   setSchema(d.schema, model, t);
   db.close();
};

function models() {
   var t = this;
   t.models.forEach(e => {
      t.version++;
      var db = t.openResult;
      var collecions = db.objectStoreNames;

      if (collecions.contains(e.modelName)) return setSchema(e.schema, null, t);
      var open = this.dbApi.open(t.dbName, t.version);
      open.onupgradeneeded = createModel.bind(null, t, e);
   })
}

MerlinDB.prototype.model = function (modelName, schema) {
   var t = this;
   t.models.push({ modelName, schema });
   return new Query(schema, t, modelName);
};

/**@private */
MerlinDB.prototype.version = function () {
   return new Promise(resolve => {
      var db = this.dbApi.open(this.dbName);

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
         t.version = db.version;
         t.openResult = db;
         models.call(t);
         db.close();
         resolve({ status: 200, message: "Database connected" })
      }

      t.open.onerror = (err) => {
         reject({ status: 400, message: err })
      }
   })
};

//Delete Model
MerlinDB.prototype.deleteModel = function (modelName) {
   var t = this;
   return new Promise((resolve, reject) => {
      t.dbApi.open(t.dbName).onsuccess = (e) => {
         var db = e.target.result;
         var version = db.version + 1;
         db.close();

         var req = t.dbApi.open(t.dbName, version);

         req.onupgradeneeded = function (e) {
            var db = e.target.result;

            if (!isModel(db, modelName)) return reject(`'${modelName}' model not found!`)
            db.deleteObjectStore(modelName);
         };
         req.onsuccess = resolve.bind(null, `${modelName} was deleted!`);
         req.onerror = reject;
         db.close();
      }
   })
};

//Drop Database
MerlinDB.prototype.dropDatabase = function (dbName) {
   var t = this;
   return new Promise((resolve, reject) => {
      var db = t.dbApi.deleteDatabase(dbName);

      db.onsuccess = () => {
         resolve({ status: 200, message: "Database deleted successfully" });
      };

      db.onerror = (err) => {
         reject({ status: 400, message: err });
      };
   });
}

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




