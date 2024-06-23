import CrypThor from "./crypthor/index.js";
import { MerlinError, MerlinInvalidOptionError } from "./errors.js";
import MerlinDB from "./index.js";
import ObjectId from "./objectId.js";
import Operators from "./operators.js";
import Validator from "./validator.js";


function Query(schema, merlin, model) {
   /**@protected */
   this.schema = schema;
   /**@protected */
   this.merlin = merlin;
   /**@protected */
   this.modelName = model;
   /**@protected */
   this.error = {};
   /**@protected */
   this.index = 0;
   /**@protected */
   this.controller = {};
   /**@protected */
   this.entries = Object.entries;
   /**@protected */
   this.firstOperators = [
      "$and",
      "$nor",
      "$or",
      "$text",
      "$where",
   ];

   return this;
}
/**@private */
Query.prototype.existsId = function (store, e, call) {
   var t = this;
   e.id_ = new ObjectId().toString();

   store.get(e.id_).onsuccess = (f) => {
      if (f.target.result) {
         t.existsId(store, e, call);
         return;
      };

      call(e);
   }
}
/**@private */
Query.prototype.TypeError = function (current, type, oms) {

   if (type.indexOf(typeof current) == -1) {
      throw new Error(
         `{{'${oms}' method}} must be a '${type.join(",")}'!`
      );
   }
}
/**@private */
Query.prototype.insertCollection = async function (data, resolve, options) {
   var isOrder = options && options.ordered === false ? false : true;
   var insertedId = [];

   for (const item of data) {

      if (isOrder) {
         item.$order = item.$order || Date.now();
      }

      item.id_ = item.id_ || new ObjectId().toString();
      insertedId.push(item.id_);

      var [ db, result ] = await this.dbOpen();

      db.add(item);

      result.close();
   }

   var res = {
      "acknowledged": true,
   };

   if (insertedId.length > 1) {
      res.insertedIds = insertedId;
      res.data = data;
   }

   if (insertedId.length == 1) {
      res.insertedId = insertedId[ 0 ];
      res.data = data[ 0 ];
   }

   resolve(res);
}
/**@private */
Query.prototype.promise = function (callback) {
   return new Promise(callback);
}
/**@private */
Query.prototype.cursorFind = function (controller, resolve, e) {
   var cursor = e.target.result;

   if (!!this.hasQueryResult) {
      controller.result = this.hasQueryResult;
      return resolve(controller.result);
   }

   if (cursor) {
      controller.result.push(cursor.value);
      cursor.continue();

   } else {
      /**@private */
      this.hasQueryResult = controller.result;
      resolve(controller.result);
   }
};
/**@private */
Query.prototype.delaySimulation = function (resolve, timer, data) {
   clearTimeout(delay);

   var delay = setTimeout(() => {
      resolve(data || []);
   }, timer || 2000);
}
/**@private */
Query.prototype.prettyPrint = function (doc) {
   return JSON.stringify(doc, null, 2);
}
/**@private */
Query.prototype.getQueries = function (controller, reject) {
   return new Promise((resolve) => {
      var this_ = this;

      controller.result = [];
      var merlin = this.merlin;
      var open = merlin.dbApi.open(merlin.dbName);

      open.onsuccess = function (event) {

         var ms = controller.maxTimeMS;

         if (controller.maxTimeMS) {
            controller.maxTimeMS = setTimeout(() => {

               reject(`Error: operation exceeded time ${ms}ms!`);
            }, controller.maxTimeMS);
         }

         var result = event.target.result;

         if (!result.objectStoreNames.contains(this_.modelName)) {
            resolve([]);
            return result.close();
         }

         var trans = result.transaction([ this_.modelName ], 'readwrite');
         var store = trans.objectStore(this_.modelName);

         if (controller.hint) {
            if (!store.indexNames.contains(controller.hint)) {
               return reject(`There's no '${controller.hint}' index using hint!`)
            }
            store = store.index(controller.hint);
         }

         var cursor = store.openCursor();
         cursor.onsuccess = this_.cursorFind.bind(this_, controller, resolve);
         controller.store = store;
         controller.dbResult = result;
      }
   });
}
/**@private */
Query.prototype.sortByCriteria = function (array, criteria) {
   array = array || [];

   criteria = criteria || (array[ 0 ].$order ? { $order: 1 } : {});
   criteria = Object.entries(criteria);
   var arr = array;

   return arr.sort((a, b) => {
      for (const [ key, order ] of criteria) {
         if (a[ key ] < b[ key ]) return -order;
         if (a[ key ] > b[ key ]) return order;
      }
      return 0;
   });
}
/**@private */
Query.prototype.deleteOne_ = function (store, data, resolve) {
   store.delete(data.id_).onsuccess = () => {
      resolve("Deleted!");
   }
}
/**@private */
Query.prototype.updateOne_ = function (store, data, resolve) {
   store.put(data).onsuccess = () => {
      resolve("Successfully.");
   }
}
/**@private */
Query.prototype.forEachController = function (controller, resolve) {
   function save() {
      return new Promise(resolve => {

         this.save && delete this.save;
         this.delete && delete this.delete;
         updateOne_(controller.store, this, resolve);
      })
   }

   function delete_() {
      return new Promise(resolve => {

         this.save && delete this.save;
         this.delete && delete this.delete;
         deleteOne_(controller.store, this, resolve);
      })
   };

   controller.result.forEach((e) => {
      e.save = save;
      e.delete = delete_;
      controller.forEach(e)
   });

   resolve("Using forEach method!")
}
/**@private */
Query.prototype.returnKeyController = function (controller, reject) {
   var result = [];

   if (!controller.result[ 0 ].id_) {
      reject("There is no key in the query");
   }

   controller.result.forEach(e => {
      result.push({ id_: e.id_ });
   });

   return result;
}
/**@private */
Query.prototype.mapController = function (controller, resolve) {
   controller.result.map((e) => {
      controller.map(e)
   });

   resolve("Using map method!")
}
/**@private */
Query.prototype.filterMaxValues = function (controller) {
   return controller.result.filter(item => {
      return Object.keys(controller.max).every(key => {

         return item[ key ] <= controller.max[ key ];
      });
   });
}
/**@private */
Query.prototype.filterMinValues = function (controller) {
   return controller.result.filter(item => {
      return Object.keys(controller.min).every(key => {

         return item[ key ] >= controller.min[ key ];
      });
   });
}
/**@private */
Query.prototype.operators = function (criteria, query, key, opt) {
   var query_ = query[ key ] || query;
   var recoveryCriteria = criteria;

   if (this.firstOperators.indexOf(key) !== -1) {

      return new Operators()[ key ](criteria, query_, opt, query, key);
   }
   criteria = Object.entries(criteria)[ 0 ];

   if (!criteria) {
      throw new MerlinInvalidOptionError(`Invalid option value in '${key}'`);
   };

   query_ = this.getProperty(query, key);

   if (criteria[ 0 ] === "$exists") {
      query_ = [ query, key, recoveryCriteria ];
   }

   if (!Operators.prototype[ criteria[ 0 ] ]) {
      throw new MerlinInvalidOptionError(`Invalid option '${criteria[ 0 ]}'`);
   }

   return new Operators()[ criteria[ 0 ] ](criteria[ 1 ], query_, opt, query, key);
}
/**@private */
Query.prototype.getProperty = function (item, path) {
   return path.split('.').reduce(function (prev, curr) {
      return prev ? prev[ curr ] : undefined
   }, item || self);
}
/**@private */
Query.prototype.criteria = async function (query, criteria, opt) {
   if (!(criteria instanceof Object) || Array.isArray(criteria)) {
      throw new Error(`Query needs to be an '{}', or 'null'`);
   }

   if (!Object.keys(criteria).length) {
      return query;
   }

   var newQuery = [];
   for (var i = 0; i < query.length; i++) {
      var criteriaMet = true;
      for (var key in criteria) {

         if (typeof criteria[ key ] === "function") {
            if (await this.$where(criteria[ key ], query[ i ], key, opt)) {
               criteriaMet = false;
               break;
            }
         }

         if (typeof criteria[ key ] !== "object" && typeof criteria[ key ] !== "function") {

            if (this.getProperty(query[ i ], key) !== criteria[ key ]) {
               criteriaMet = false;
               break;
            }
         }

         if (typeof criteria[ key ] === "object") {

            if (this.operators(criteria[ key ], query[ i ], key, opt)) {
               criteriaMet = false;
               break;
            }
         }
      }

      if (criteriaMet) {
         newQuery.push(query[ i ]);
      }
   }

   return newQuery;
}
/**@private */
Query.prototype.version = function () {
   var merlin = this.merlin;

   var open = merlin.dbApi.open(merlin.dbName);

   return new Promise((resolve) => {
      open.onsuccess = (e) => {
         resolve(e.target.result.version);
         e.target.result.close();
      }
   })
}
/**@private */
Query.prototype.dbOpen = function (version) {
   var merlin = this.merlin;
   var open = merlin.dbApi.open(merlin.dbName, version);
   var this_ = this;

   return new Promise((resolve) => {
      open.onsuccess = (event) => {
         var result = event.target.result;

         if (!result.objectStoreNames.contains(this_.modelName)) {
            result.close();
            return this_.dbOpen(version);
         }

         var trans = result.transaction([ this_.modelName ], 'readwrite');
         var store = trans.objectStore(this_.modelName);
         resolve([ store, result, trans ]);
      }
   })
}
/**@private */
Query.prototype.upgrade = function (version) {
   var merlin = this.merlin;
   var open = merlin.dbApi.open(merlin.dbName, version + 1);

   return new Promise((resolve) => {
      open.onupgradeneeded = (event) => {
         var result = event.target;
         resolve(result);
      }
   })
}

//PUBLIC 
Query.prototype.sort = function (sort) {
   this.TypeError(sort, [ 'object' ], 'sort');

   this.controller[ this.index ].sort = sort;
   return this;
};

Query.prototype.limit = function (limit) {
   this.TypeError(limit, [ 'number' ], 'limit');

   this.controller[ this.index ].limit = limit;
   return this;
};

Query.prototype.skip = function (skip) {
   this.TypeError(skip, [ 'number' ], 'skip');

   this.controller[ this.index ].skip = skip;
   return this;
};

Query.prototype.forEach = function (response) {
   this.TypeError(response, [ 'function' ], 'forEach');

   this.controller[ this.index ].forEach = response;
   return this;
};

Query.prototype.pretty = function () {
   this.controller[ this.index ].pretty = true;
   return this;
};

Query.prototype.map = function (response) {
   this.TypeError(response, [ 'function' ], 'map');

   this.controller[ this.index ].map = response;
   return this;
};

Query.prototype.maxTimeMS = function (milliseconds) {
   this.TypeError(milliseconds, [ 'number' ], 'maxTimeMS');

   this.controller[ this.index ].maxTimeMS = milliseconds;
   return this;
};

Query.prototype.hint = function (index) {
   typeof index === "object" && (index = Object.keys(index)[ 0 ]);
   this.TypeError(index, [ 'string', 'object' ], 'hint');

   this.controller[ this.index ].hint = index || "id_";
   return this;
};

Query.prototype.returnKey = function () {

   this.controller[ this.index ].returnKey = true;
   return this;
};

Query.prototype.size = function () {

   this.controller[ this.index ].size = true;
   return this;
};

Query.prototype.max = function (query) {
   this.TypeError(query, [ 'object' ], 'max');

   this.controller[ this.index ].max = query;
   return this;
};

Query.prototype.min = function (query) {
   this.TypeError(query, [ 'object' ], 'min');

   this.controller[ this.index ].min = query;
   return this;
};
/**@private */
Query.prototype.encrypt = function (options, data) {

   return new Promise(async (resolve) => {
      var crypt = new CrypThor({
         hash: options.hash || null,
         iterations: options.iterations || null,
         strength: options.strength || null,
         salt: options.salt || null,
      });

      data.forEach(async item => {
         for (const key of options.fields) {
            item[ key ] = await crypt.encrypt(item[ key ], options.secretKey)
         }
      });

      setTimeout(() => {
         resolve(data);
      }, 500 * data.length);
   })
};
/**@private */
Query.prototype.decrypt = function (options, data) {

   return new Promise(async (resolve) => {
      var crypt = new CrypThor({
         hash: options.hash || null,
         iterations: options.iterations || null,
         strength: options.strength || null,
         salt: options.salt || null,
      });

      data.forEach(async item => {
         for (const key of options.fields) {
            item[ key ] = await crypt.decrypt(item[ key ], options.secretKey)
         }
      });

      setTimeout(() => {
         resolve(data);
      }, 500 * data.length);
   })
};
/**@private */
Query.prototype.getModel = function (model) {
   return new Promise(resolve => {

      this.merlin.getModel(model).then(e => {

         resolve(true);
      }).catch(async e => {

         this.merlin.createModel(model, this.schema)
            .then(e => {
               resolve(true)
            })
      });
   })
};

//INSERT   
/**
 * @typedef {Object} OptionsInsert
 * @property {Boolean} ordered - default is true
 * @param {OptionsInsert} options 
 * @param {*} data 
 * @returns 
 */
Query.prototype.insert = async function (data, options) {
   this.TypeError(data, [ 'object' ], 'insert');

   this.error.insert = [];
   data = !data.length ? [ data ] : data;

   var promise = new Promise(async (resolve, reject) => {
      var validator = await new Validator(data, this.schema, this);

      if (typeof validator !== 'object') {
         return reject(validator);
      }

      await this.getModel(this.modelName);

      this.insertCollection(data, resolve, options);
   });

   this.then = promise.then.bind(promise);
   this.catch = promise.catch.bind(promise);

   return this;
};

Query.prototype.insertOne = function (data) {
   if (typeof data !== 'object' || !data || Array.isArray(data)) {
      throw new MerlinError(`'data' param needs to be an object!`)
   }
   data = [ data ];
   return this.insert(data);
};

/**
 * @typedef {Object} OptionsInsert
 * @property {Boolean} ordered - default is true
 * @param {OptionsInsert} options 
 * @param {*} data 
 * @returns 
 */
Query.prototype.insertMany = function (data, options) {
   if (!data || !Array.isArray(data)) {
      throw new MerlinError(`'data' param needs to be an array!`)
   }

   if (data.length === 0) {
      throw new MerlinError(`Define an item to insert into the database!`)
   }

   return this.insert(data, options);
};

//FIND
/**@private */
Query.prototype.toFilter = async function (controller, resolve, reject, opt) {

   var query = await this.getQueries.bind(this, controller, reject)();

   if (query.length == 0) return resolve(`There's no data to recovery`);

   //maxTimeMS
   clearTimeout(controller.maxTimeMS);

   //curve
   query = await this.criteria(query, controller.query, opt);

   //sort
   this.sortByCriteria(query, controller.sort);

   controller.skip = controller.skip || 0;
   controller.limit = controller.limit || 0;

   //min
   if (controller.min) {
      query = this.filterMinValues(controller);
   }

   //max
   if (controller.max) {
      query = this.filterMaxValues(controller);
   }

   //skip
   controller.result = query.slice(controller.skip);

   //limit
   controller.result = query.slice(controller.skip, controller.limit ? controller.skip + controller.limit : void 0);

   //forEach
   if (controller.forEach) {

      return this.forEachController(controller, resolve);
   }

   //map
   if (controller.map) {
      return resolve(this.mapController(controller.result));
   }

   //returnKey
   if (controller.returnKey) {
      controller.result = this.returnKeyController(controller, reject);
   }

   //returnKey
   if (controller.size) {
      return resolve(controller.result.length);
   }


   if (controller.pretty) {
      controller.result = prettyPrint(controller.result);
   }

   controller.dbResult.close();
   return controller.result;
}

/** @private*/
Query.prototype.balance = function (filter, options, response) {
   filter = filter || {};
   var t = this;
   this.index++;

   this.controller[ this.index ] = {};
   this.controller[ this.index ].query = filter;

   var promise = new Promise((resolve, reject) => {
      response(t.toFilter.bind(this, this.controller[ this.index ], resolve, reject, options)(), resolve);
   });

   this.then = promise.then.bind(promise);
   this.catch = promise.catch.bind(promise);
   return t;
};

/**  
 * @typedef {Object} DecryptFind 
   * @property {("SHA-256"|"SHA-384"|"SHA-512")} hash -  
   * @property {Number} salt -   
   * @property {Array} fields -   
   * @property {String} secretKey -   
   * @property {Number} iterations -    
   * @property {("medium"|"strict"|"high"|"strong"|"stronger"|"galaxy")} strength -  
 * @typedef {Object} Options 
 * @property {Object} $ne - Defines what you want to allow for $ne {string: 1, number: -1}
 * @property {(1|-1)} null - Allow null? -1 = no, 1 = yes
 * @property {DecryptFind} decrypt
 * @param {Options} options -
 * @param {Object} filter -
 * @returns {Query} -
 */
Query.prototype.find = function (filter, options) {
   var this_ = this;
   return this.balance(filter, options, async function (data, resolve) {
      if (options && options.decrypt) {
         data = await data;
         data = await this_.decrypt(options.decrypt, data);
         return resolve(data)
      };
      resolve(data)
   });
};

Query.prototype.findOne = function (filter, options) {
   var this_ = this;

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      if (options && options.decrypt) {
         data = await data;
         data = await this_.decrypt(options.decrypt, data);
         return resolve(data)
      };

      resolve(data[ 0 ])
   });
};

Query.prototype.findOneAndDelete = function (filter, options) {
   var this_ = this;

   if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MerlinError(`'filter' param needs to be an object {}`);
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data[ 0 ] || void 0;

      if (!data) {

         return resolve({ acknowledged: true, deletedCount: 0 });
      }

      var rec = JSON.stringify(data);
      var [ db, result ] = await this_.dbOpen();

      db.delete(data.id_).onsuccess = () => {
         resolve(JSON.parse(rec));
      }

      result.close();
   });
};

/**
 * @typedef {Object} OptionsReplace
 * @property {Boolean} upsert - 
 * @param {OptionsReplace} options - 
 * @returns 
 */
Query.prototype.findOneAndReplace = function (filter, replace, options) {
   var this_ = this;

   if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MerlinError(`'filter' param needs to be an object {}`);
   }

   if (!replace || typeof replace !== 'object' || Array.isArray(replace)) {
      throw new MerlinError(`'replace' param needs to be an object {}`);
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data[ 0 ] || void 0;

      if (!data && options && !options.upsert || !data && !options) {
         return resolve({ acknowledged: true, replacedCount: 0 });
      }

      if (options && options.upsert && !data) {
         var id_ = new ObjectId().toString();
         data = {};
         data.id_ = id_;
      }

      var res = JSON.stringify(data);
      var [ db, result ] = await this_.dbOpen();

      for (const key in replace) {
         data[ key ] = replace[ key ];
      }

      db.put(data).onsuccess = () => {
         resolve(JSON.parse(res));
      }

      result.close();
   });
};

/**
 * @typedef {Object} UpdateFOAU
 * @property {Object} $inc -
 * @property {Object} $set -
 * @typedef {Object} optionsFOAU
 * @property {Boolean} upsert -
 * @property {Boolean} new -
 * @param {Object} filter - 
 * @param {UpdateFOAU} update -
 * @param {optionsFOAU} options - 
 * @returns 
 */
Query.prototype.findOneAndUpdate = function (filter, update, options) {
   var this_ = this;

   if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MerlinError(`'filter' param needs to be an object {}`);
   }

   if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new MerlinError(`'update' param needs to be an object {}`);
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data[ 0 ] || void 0;

      if (!data && options && !options.upsert || !data && !options) {
         return resolve({ acknowledged: true, replacedCount: 0 });
      }

      if (options && options.upsert && !data) {
         var id_ = new ObjectId().toString();
         data = {};
         data.id_ = id_;
      }

      var res = JSON.stringify(data);
      var [ db, result ] = await this_.dbOpen();

      for (const key in update) {

         if (!Operators.prototype[ key ]) {
            throw new MerlinError(`There is no '$${key}' in update method, try ($set, $inc)!`)
         }
         new Operators()[ key ](update[ key ], data);
      }

      db.put(data).onsuccess = () => {
         if (options && options.new) {
            resolve(data);

            return;
         }

         resolve(JSON.parse(res));
      }

      result.close();
   });
};

/**@private */
Query.prototype.unavailable = function (type) {
   return new Promise((resolve, reject) => {
      reject(`🧙‍♂️ Sorry, the '${type}' method will be available in the next versions!`)
   });
};

Query.prototype.aggregate = function () {
   return this.unavailable("aggregate");
};

Query.prototype.bulkWrite = function (operations) {
   return this.unavailable("bulkWrite");
};
/**@private */
Query.prototype.creatingIndex = async function () {
   var args = arguments;
   var this_ = this;
   var merlin = this.merlin;
   var keys = args[ 0 ];
   var name = '';
   var options = args[ 1 ];
   var direction = 'prev';
   var version = await this.version.call(this);
   var open = merlin.dbApi.open(merlin.dbName, version + 1);

   if (!options.name) {
      keys.forEach(e => {
         name += e + "_";
      });
   }
   name = args[ 1 ].name || name.slice(0, -1);
   if (options.direction === 1 || !options.direction) {
      direction = "next";
   }

   open.onupgradeneeded = function (e) {
      var trans = e.target.transaction;
      var store = trans.objectStore(this_.modelName);

      if (store.indexNames.contains(name)) {
         return args[ 3 ](`Index '${name}' already exists in your database!`)
      }

      store.createIndex(name, keys, {
         unique: options.unique,
         locale: options.locale || void 0,
         direction: direction,
      });
   }

   open.onsuccess = function (e) {
      if (args[ 4 ] === args[ 5 ]) {
         args[ 2 ](`'${args[ 5 ] + 1}' indexes created successfully`);
      }

      if (!args[ 4 ]) {
         args[ 2 ](`index ${name} created!`);
      }
      e.target.result.close();
   }
};

/**  
 * @typedef {Object} CreateIndex
 * @property {Boolean} unique - unique values or not, default is false
 * @property {Boolean} name - unique values or not, default is false
 * @property {(1|-1)} direction - Specify index sorting direction
 * @property {String} locale - Determine the language in `iso` of how strings are defined and compared when creating an index
 * @param {CreateIndex} options - Options to your index
 * @param {Object} keys - Key index name
 */
Query.prototype.createIndex = function (keys, options) {

   return new Promise(
      this.creatingIndex.bind(this, keys, options)
   );
};

/**  
 * @typedef {Object} CreateIndex
 * @property {Boolean} unique - unique values or not, default is false
 * @property {Boolean} name - unique values or not, default is false
 * @property {(1|-1)} direction - Specify index sorting direction
 * @property {String} locale - Determine the language in `iso` of how strings are defined and compared when creating an index
 * @param {CreateIndex} options - Options to your index
 * @param {Object} keyPatterns - Define your patterns
 */
Query.prototype.createIndexes = function (keyPatterns, options) {
   if (!Array.isArray(keyPatterns)) {
      throw new MerlinError("'keyPatterns' param needs to be an Array!")
   }

   var count = keyPatterns.length - 1;

   return new Promise((resolve, reject) => {
      keyPatterns.forEach((e, i) => {
         this.creatingIndex(e, options, resolve, reject, count, i);
      });
   });
};

Query.prototype.$where = async function () {
   if (arguments.length <= 1) {
      this.index++;
      this.controller[ this.index ] = {};

      var query = await this.getQueries.bind(this, this.controller)();
      var newQuery = [];

      query.forEach(e => {
         if (!new Operators().$where(arguments, arguments[ 1 ] = e)) {
            newQuery.push(e)
         }
      });

      var promise = new Promise(resolve => {
         resolve(newQuery)
      });

      this.catch = promise.catch.bind(promise);
      this.then = promise.then.bind(promise);

      return this;
   }

   return new Operators().$where(arguments);
};

/** @private*/
Query.prototype.formatDataSize = function (bytes, opt) {
   opt.format = opt.format.toLowerCase();

   var convert = {
      kb: 1,
      mb: 2,
      gb: 3,
   }[ opt.format ]

   var abbr = {
      kb: ' kB',
      mb: ' MB',
      gb: ' GB',
   }[ opt.format ];

   var fix = {
      kb: 2,
      mb: 2,
      gb: 6,
   }[ opt.format ];

   convert = (bytes / (1024 ** convert)).toFixed(fix);
   convert = Number(convert);

   if (opt.string) {

      convert = convert.toLocaleString(opt.locale || 'en-US', {
         minimumFractionDigits: 2,
         maximumFractionDigits: 2
      });
   }

   return [ convert, opt.string ? abbr : null ]
};

/**
 * @typedef {Object} FormatOptions
 * @property {("kB"|"MB"|"GB")} format - 
 * @property {Boolean} string - Show format with type in string.
 * @param {FormatOptions} options -   
 */
Query.prototype.dataSize = function (options) {
   var this_ = this;
   var merlin = this.merlin;

   return new Promise((resolve) => {
      var open = merlin.dbApi.open(merlin.dbName);

      open.onsuccess = function (e) {
         var result = e.target.result;
         var trans = result.transaction([ this_.modelName ], 'readonly');
         var store = trans.objectStore(this_.modelName);
         var all = store.getAll();
         var size = 0;

         all.onsuccess = (e) => {
            e.target.result.forEach(e => {
               size += JSON.stringify(e).length;
            });

            var format = [ size, options && options.string ? ' bytes' : null ];

            if (options && options.format) {
               format = this_.formatDataSize(size, options);
            }

            resolve(format[ 0 ] + format[ 1 ])
         };
      }
   });
};

Query.prototype.estimatedDocumentCount = function () {
   return new Promise(async (resolve, reject) => {
      var [ db, result ] = await this.dbOpen();
      var trans = result.transaction([ this.modelName ], 'readonly');
      var store = trans.objectStore(this.modelName);
      store.count().onsuccess = (e) => {
         resolve(e.target.result)
      };
      result.close();
   })
};

Query.prototype.countDocuments = function (filter, options) {
   if (!(filter instanceof Object)) {
      throw new MerlinError(`Invalid 'filter' type, define an object`)
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      resolve(data.length);
   });
};

//DELETE  
/**   
 * @param {Object} filter  
 */
Query.prototype.deleteOne = function (filter, options) {
   if (!(filter instanceof Object)) {
      throw new MerlinError(`Invalid 'filter' type, define an object`)
   }
   var this_ = this;

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data[ 0 ] || void 0;

      if (!data || data.length === 0) {
         resolve({ acknowledged: true, deletedCount: 0 })
         return;
      }

      var [ store, result ] = await this_.dbOpen();

      store.delete(data.id_).onsuccess = () => {
         resolve({ acknowledged: true, deletedCount: 1 })
      }

      result.close();
   });
};

/**   
 * @param {Object} filter  
 */
Query.prototype.deleteMany = function (filter, options) {
   if (!(filter instanceof Object)) {
      throw new MerlinError(`Invalid 'filter' type, define an object`)
   }
   var this_ = this;

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data || void 0;

      if (!data || data.length === 0) {
         resolve({ acknowledged: true, deletedCount: 0 })
         return;
      }

      var [ store, result ] = await this_.dbOpen();
      var deletedCount = 0;

      data.forEach(item => {
         store.delete(item.id_);
         deletedCount++;
      });

      resolve({ acknowledged: true, deletedCount: deletedCount });

      result.close();
   });
};

/**   
 * @param {Object} filter  
 */
Query.prototype.distinct = function (filter, options) {

   if (typeof filter !== "string") {
      throw new MerlinError(`Invalid 'filter' type, define an string`)
   }
   filter = filter.split(".");
   var distinct = [];

   return this.balance({}, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data || void 0;

      data.forEach(e => {

         if (distinct.indexOf(e[ filter[ 0 ] ]) == -1) {
            distinct.push(e[ filter[ 0 ] ]);
         }
      });

      resolve(distinct);
   });
};

Query.prototype.dropIndex = function (indexName) {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = await this.upgrade(version, true);
      var store = db.transaction.objectStore(this.modelName);


      if (!store.indexNames.contains(indexName)) {
         return reject(`There's no index '${indexName}' in your '${this.modelName}'`);
      }

      store.deleteIndex(indexName);

      resolve({
         "msg": "indexes dropped for collection",
         "ok": 1
      });

      db.result.close()
   })
};

Query.prototype.dropIndexes = function (indexesName) {
   var this_ = this;

   if (!Array.isArray(indexesName)) {
      throw new MerlinError(`'indexesName' needs to be an array!`);
   }

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = await this.upgrade(version, true);
      var store = db.transaction.objectStore(this.modelName);
      var dropped = [];

      for (const index of indexesName) {
         if (!store.indexNames.contains(index)) {
            return reject(`There's no index '${index}' in your '${this_.modelName}'`);
         }
         dropped.push(index);
         store.deleteIndex(index);
      }

      resolve({
         "droppedIndexes": dropped,
         "msg": "indexes dropped for collection",
         "ok": 1
      });

      db.result.close()
   })
};

Query.prototype.drop = function () {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = await this.upgrade(version);
      db = db.result;

      if (!db.objectStoreNames.contains(this.modelName)) {
         db.close()
         return resolve(false)
      }

      db.deleteObjectStore(this.modelName)
      resolve(true);

      db.close()
   })
};

/**@private */
Query.prototype.modifyFields = function (option, data) {
   var newData = {};

   if (!!option) {
      data = this.entries(data);

      data.forEach(item => {
         for (const key in option) {

            if (item[ 0 ] === key && option[ key ] === 1) {
               newData[ key ] = item[ 1 ]
            }

            if (item[ 0 ] === key && option[ key ] === -1) {
               newData = data;
               delete newData[ item[ 0 ] ];
            }
         }
      });
   }

   return newData;
};

//UPDATE
/**
 * @typedef {Object} UpdateFAM
 * @property {Object} $set -
 * @property {Object} $inc -
 */
/**
 * @typedef {Object} FindAndModify
 * @property {Object} query - 
 * @property {Object} sort - 
 * @property {Boolean} remove -  
 * @property {UpdateFAM} update - 
 * @property {Boolean} new -
 * @property {Object} fields - 
 * @property {Boolean} upsert - 
 * @param {FindAndModify} options
 * @returns 
 */
Query.prototype.findAndModify = function (options) {
   if (!(options instanceof Object)) {
      throw new MerlinError(`Invalid 'options' type, define an object`)
   }

   if (!options.query) {
      throw new MerlinError(`Define an 'query' property in your option!`)
   }
   var this_ = this;

   return this.balance(options.query, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data[ 0 ] || void 0;
      var rec = JSON.stringify(data);
      var newData = {};

      if (!data && !!options.remove) {
         return resolve({});
      }

      var [ store, result ] = await this_.dbOpen();

      if (!!options.remove) {
         newData = this_.modifyFields(options.fields, data);

         store.delete(data.id_).onsuccess = () => {
            resolve(newData);
         }

         result.close();
         return;
      }

      if (!options.update) {
         result.close();
         throw new MerlinError(`You need define an 'update' or 'remove' option`);
      }

      var update = this_.entries(options.update)[ 0 ];

      if (!Operators.prototype[ update[ 0 ] ]) {
         result.close();
         throw new MerlinError(`Invalid '${update[ 0 ]}' property!`);
      }

      data = new Operators()[ update[ 0 ] ](update[ 1 ], data, options && options.upsert);
      newData = this_.modifyFields(options.fields, data);

      if (!data.id_) {
         data.id_ = new ObjectId().toString();
         store.add(data);
      }

      store.put(data).onsuccess = () => {
         var result = null;

         if (options.new) {
            result = newData
         } else {
            result = JSON.parse(rec);
            result = this_.modifyFields(options.fields, result);
         }

         resolve(result);
      };

      result.close();
   });
};

Query.prototype.getIndexes = function () {
   return new Promise(async (resolve, reject) => {
      var [ db, result ] = await this.dbOpen();
      var indexes = [];

      if (db.indexNames.length === 0) {
         result.close();
         return resolve({ indexesCount: 0 })
      }

      this.entries(db.indexNames).forEach(index => {
         indexes[ index[ 0 ] ] = {
            v_: index[ 0 ],
            status: "active",
            name: index[ 1 ]
         };
      });

      resolve(indexes)
      result.close();
   })
};

/**
 * @typedef {Object} UpdateFOAU
 * @property {Object} $inc -
 * @property {Object} $set -
 * @typedef {Object} optionsFOAU
 * @property {Boolean} upsert -
 * @property {Boolean} new -
 * @param {Object} filter - 
 * @param {UpdateFOAU} update -
 * @param {optionsFOAU} options - 
 * @returns 
 */
Query.prototype.updateOne = function (filter, update, options) {
   return this.findOneAndUpdate(filter, update, options);
};

/**
 * @typedef {Object} UpdateFOAU
 * @property {Object} $inc -
 * @property {Object} $set -
 * @typedef {Object} optionsFOAU
 * @property {Boolean} upsert -
 * @property {Boolean} new -
 * @param {Object} filter - 
 * @param {UpdateFOAU} update -
 * @param {optionsFOAU} options - 
 * @returns 
 */
Query.prototype.updateMany = function (filter, update, options) {
   var this_ = this;

   if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new MerlinError(`'filter' param needs to be an object {}`);
   }

   if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new MerlinError(`'update' param needs to be an object {}`);
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];
      data = data || void 0;

      if (!data && options && !options.upsert || !data && !options) {
         return resolve({ acknowledged: true, replacedCount: 0 });
      }

      if (options && options.upsert && !data) {
         var id_ = new ObjectId().toString();
         data = {};
         data.id_ = id_;
      }

      var res = JSON.stringify(data);
      var [ db, result ] = await this_.dbOpen();

      data.forEach(item => {
         for (const key in update) {
            if (!Operators.prototype[ key ]) {
               throw new MerlinError(`There is no '$${key}' in update method, try ($set, $inc)!`)
            }

            var oper = new Operators()[ key ](update[ key ], item, options && options.upsert);
            db.put(oper);
         }
      });

      db.transaction.oncomplete = function () {
         if (options && options.new) {
            resolve(data);

            return;
         }

         resolve(JSON.parse(res));
      }

      result.close();
   });
};

/**@private */
Query.prototype.byId = function (id) {
   return new Promise(async (resolve, reject) => {
      if (typeof id !== "string" && typeof id !== "number") {
         throw new MerlinError(`'id' property needs to be an (number or string);`)
      }

      var [ db, result ] = await this.dbOpen();
      var index = db.index("id_");
      var find = index.get(id);

      find.onsuccess = (e) => {
         var result = e.target.result;
         if (!result) {
            return resolve({});
         }

         resolve(result);
      }

      result.close();
   })
};

/**
 * 
 * @typedef {Object} findById
 * @property {Object} fields - 
 * @param {findById} options - 
 */
Query.prototype.findById = async function (id, options) {
   var result = await this.byId(id);
   var newData = {};

   if (!options || !options.fields) {
      return result;
   }

   if (options.fields && !Object.keys(options.fields).length) {
      throw new MerlinError(`Define an 'fields' or remove in options param!`)
   }

   for (const key in result) {
      if (options && options.fields[ key ] === 1) {
         newData[ key ] = result[ key ]
      }

      if (options && options.fields[ key ] === -1) {
         delete result[ key ]
         newData = result;
      }
   }

   return newData;
};

/**
 * 
 * @typedef {Object} findById
 * @property {Object} fields - 
 * @param {findById} options - 
 */
Query.prototype.findByIdAndDelete = function (id) {
   return new Promise(async (resolve) => {
      var data = await this.byId(id);

      if (!Object.keys(data).length) {
         return resolve({ acknowledged: true, deletedCount: 0 });
      }

      var [ db, result ] = await this.dbOpen();

      db.delete(data.id_).onsuccess = () => {
         resolve({ acknowledged: true, deletedCount: 1 });
      }

      result.close();
   })
};

/**
 *  @typedef {Object} findByIdAndUpdate
 * @property {Object} $set - 
 * @property {Object} $inc - 
 * @param {findByIdAndUpdate} update  
 *  @typedef {Object} findByIdAndUpdateOpt 
 * @property {Boolean} new - 
 * @param {findByIdAndUpdate} update  
 * @param {findByIdAndUpdateOpt} options  
 * @returns 
 */
Query.prototype.findByIdAndUpdate = function (id, update, options) {
   return new Promise(async (resolve) => {
      var data = await this.byId(id);

      if (!Object.keys(data).length) {
         return resolve({ acknowledged: true, deletedCount: 0 });
      }

      var [ db, result ] = await this.dbOpen();
      var res = JSON.stringify(data);

      for (const key in update) {
         new Operators()[ key ](update[ key ], data);
      }

      db.put(data).onsuccess = () => {
         if (!options || !options.new) {
            data = JSON.parse(res);
         }

         resolve(data);
      }

      result.close();
   })
};

export { ObjectId, Query as default }; 
