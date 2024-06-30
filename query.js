import CrypThor from "./crypthor/index.js";
import { MerlinError, MerlinInvalidOptionError } from "./errors.js";
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
};
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
};
/**@private */
Query.prototype.TypeError = function (current, type, oms) {

   if (type.indexOf(typeof current) == -1) {
      throw new Error(
         `{{'${oms}' method}} must be a '${type.join(",")}'!`
      );
   }
};
/**@private */
Query.prototype.insertCollection = async function (data, resolve, options) {
   var isOrder = options && options.ordered === false ? false : true;
   var insertedId = [];
   var insertedItem = [];
   var this_ = this;
   var merlin = this_.merlin;

   var open = new Promise(resolve => {
      var _ = merlin.dbApi.open(merlin.dbName);
      _.onsuccess = e => {
         var result = e.target.result;
         resolve(result);
      }
   });
   open = await open;

   function addItem(item) {
      return new Promise(async (resolve) => {
         var trans = open.transaction([ this_.modelName ], 'readwrite');
         var store = trans.objectStore(this_.modelName);

         store.add(item).onsuccess = e => {
            setTimeout(() => {
               insertedId.push(item.id_);
               insertedItem.push(item);
               resolve();
            }, 1);
         };
      })
   }

   for (const item of data) {

      if (isOrder) {
         item.$order = item.$order || Date.now();
      }

      item.id_ = item.id_ || new ObjectId().toString();

      await addItem(item);
   }

   var res = {
      "acknowledged": true,
   };

   if (insertedId.length > 1) {
      res.insertedIds = insertedId;
      res.data = insertedItem;
   }

   if (insertedId.length == 1) {
      res.insertedId = insertedId[ 0 ];
      res.data = data[ 0 ];
   }
   open.close();

   resolve(res);
};
/**@private */
Query.prototype.promise = function (callback) {
   return new Promise(callback);
};
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
};
/**@private */
Query.prototype.prettyPrint = function (doc) {
   return JSON.stringify(doc, null, 2);
};
/**@private */
Query.prototype.checkQuery = function (controller) {
   return new Promise(resolve => {

      for (const key in controller.query) {
         var query = controller.query[ key ];

         if (typeof query !== 'object'
            && query
            && key.indexOf('.') === -1
            && typeof query !== 'function'
            && !Array.isArray(query)
         ) {

            return resolve([ key, query ])
         }
      }

      resolve([ false, false ]);
   })
};
/**@private */
Query.prototype.getQueries = function (controller, reject) {
   return new Promise((resolve) => {
      var this_ = this;

      controller.result = [];
      var merlin = this.merlin;

      var open = merlin.dbApi.open(merlin.dbName);
      open.onsuccess = async function (event) {

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

         var [ key, value ] = await this_.checkQuery(controller);

         if (key) {

            var index = store.index(key);
            index.getAll(value).onsuccess = e => {
               var all = e.target.result;
               controller.store = store;
               controller.dbResult = result;
               return resolve(all);
            }
         }

         cursor.onsuccess = this_.cursorFind.bind(this_, controller, resolve);
         controller.store = store;
         controller.dbResult = result;
      }
   });
};
/**@private */
Query.prototype.sortByCriteria = function (array, criteria) {
   array = array || [];

   if (typeof criteria == 'function') {
      return array.sort(criteria);
   }

   criteria = criteria || (array[ 0 ] && array[ 0 ].$order ? { $order: 1 } : {});
   criteria = Object.entries(criteria);
   var arr = array;

   return arr.sort((a, b) => {

      for (const [ key, order ] of criteria) {
         if (a[ key ] < b[ key ]) return -order;
         if (a[ key ] > b[ key ]) return order;
      }
      return 0;
   });
};
/**@private */
Query.prototype.deleteOne_ = function (store, data, resolve) {
   store.delete(data.id_).onsuccess = () => {

      resolve("Deleted!");
   }
};
/**@private */
Query.prototype.updateOne_ = function (store, data, resolve) {
   store.put(data).onsuccess = () => {

      resolve("Successfully.");
   }
};
/**@private */
Query.prototype.forEachController = function (controller, resolve) {
   var this_ = this;

   function save() {
      return new Promise(resolve => {

         this.save && delete this.save;
         this.delete && delete this.delete;
         this_.updateOne_(controller.store, this, resolve);
      })
   }

   function delete_() {
      return new Promise(resolve => {

         this.save && delete this.save;
         this.delete && delete this.delete;
         this_.deleteOne_(controller.store, this, resolve);
      })
   };

   controller.result.forEach((e) => {

      e.save = save;
      e.delete = delete_;
      controller.forEach(e)
   });

   resolve("Using forEach method!");
};
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
};
/**@private */
Query.prototype.mapController = function (controller) {
   var map = controller.result.map((e) => {

      return controller.map(e);
   });

   return map;
};
/**@private */
Query.prototype.filterMaxValues = function (controller) {
   return controller.result.filter(item => {

      return Object.keys(controller.max).every(key => {

         return item[ key ] <= controller.max[ key ];
      });
   });
};
/**@private */
Query.prototype.filterMinValues = function (controller) {
   return controller.result.filter(item => {

      return Object.keys(controller.min).every(key => {

         return item[ key ] >= controller.min[ key ];
      });
   });
};
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
};
/**@private */
Query.prototype.getProperty = function (item, path) {
   return path.split('.').reduce(function (prev, curr) {
      return prev ? prev[ curr ] : undefined
   }, item || self);
};
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
};
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
};
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
};
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
};
/**
 * Sorts documents from a collection in the MerlinDB database;
 * @param {Object|Function} sort - Criteries (order by name ascending) `{name: 1}`, or -1, allow function like `(a,b) => {return a - b}`;
 * @returns 
 */
Query.prototype.sort = function (sort) {
   this.TypeError(sort, [ 'object', 'function' ], 'sort');

   this.controller[ this.index ].sort = sort;
   return this;
};
/**
 * Limits the number of documents returned in a collection;
 * @param {Number} limit - number to limit e.g. `.limit(1)`. If used with skip method, it limits the documents next after the skip;
 * @returns 
 */
Query.prototype.limit = function (limit) {
   this.TypeError(limit, [ 'number' ], 'limit');

   this.controller[ this.index ].limit = limit;
   return this;
};
/**
 * Skipping a number of documents in a collection;
 * @param {Number} skip - number to skip e.g. `.skip(3)`
 * @returns 
 */
Query.prototype.skip = function (skip) {
   this.TypeError(skip, [ 'number' ], 'skip');

   this.controller[ this.index ].skip = skip;
   return this;
};
/**
 * Iterates over data from a document in a collection;
 * @param {Function} response - function to iterate;
 * @returns 
 */
Query.prototype.forEach = function (response) {
   this.TypeError(response, [ 'function' ], 'forEach');

   this.controller[ this.index ].forEach = response;
   return this;
};
/**
 * Pretty a data 
 * @returns readable documents from a collection;
 */
Query.prototype.pretty = function () {
   this.controller[ this.index ].pretty = true;
   return this;
};
/**
 * Transforms the documents of a query;
 * @param {Function} response - function to map;
 * @returns 
 */
Query.prototype.map = function (response) {
   this.TypeError(response, [ 'function' ], 'map');

   this.controller[ this.index ].map = response;
   return this;
};
/**
 * Define a maximum time for executing an operation in the query;
 * @param {Number} milliseconds - Limit number in milliseconds
 * @returns 
 */
Query.prototype.maxTimeMS = function (milliseconds) {
   this.TypeError(milliseconds, [ 'number' ], 'maxTimeMS');

   this.controller[ this.index ].maxTimeMS = milliseconds;
   return this;
};
/**
 * Uses indexes to quickly query the collection;
 * @param {Object} index - indexs in a object e.g. `.hint({name: -1})`;
 * @returns 
 */
Query.prototype.hint = function (index) {
   typeof index === "object" && (index = Object.keys(index)[ 0 ]);

   this.TypeError(index, [ 'string', 'object' ], 'hint');

   this.controller[ this.index ].hint = index || "id_";
   return this;
};
/** 
 * @returns The indexes of a collection;
 */
Query.prototype.returnKey = function () {

   this.controller[ this.index ].returnKey = true;
   return this;
};
/** 
 * @returns The number of documents in a query in the collection;
 */
Query.prototype.size = function () {

   this.controller[ this.index ].size = true;
   return this;
};
/**
 * Limite a maximum value for a query in the collection.
 * @param {Object} query - query in a object e.g. `.max({age: 40})`;
 * @returns 
 */
Query.prototype.max = function (query) {
   this.TypeError(query, [ 'object' ], 'max');

   this.controller[ this.index ].max = query;
   return this;
};
/**
 * Limite a minimum value for a query in the collection.
 * @param {Object} query - query in a object e.g. `.min({age: 20})`;
 * @returns 
 */
Query.prototype.min = function (query) {
   this.TypeError(query, [ 'object' ], 'min');

   this.controller[ this.index ].min = query;
   return this;
};
/**
 * Please dont use this method, be careful
 * @returns A mother
 */
Query.prototype.lilit = function () {

   this.controller[ this.index ].lilit = true;
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
   var rejected = false;
   var timer = null;

   return new Promise(async (resolve, reject) => {
      var crypt = new CrypThor({
         hash: options.hash || null,
         iterations: options.iterations || null,
         strength: options.strength || null,
         salt: options.salt || null,
      });

      if (options && !options.fields) {
         throw new MerlinError("Define 'fields' option")
      }

      if (options && !options.secretKey) {
         throw new MerlinError("Define 'secretKey' option")
      }

      data.forEach(item => {
         for (const key of options.fields) {
            crypt.decrypt(item[ key ], options.secretKey).then(e => {
               item[ key ] = e;
            }).catch(e => {
               rejected = true;
               reject({
                  [ key ]: item[ key ],
                  message: e,
               });
            })
         }
      });

      clearTimeout(timer);
      timer = setTimeout(() => {
         if (rejected) return clearTimeout(timer);

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
/**
 * Inserts one or more documents in collection;
 * @typedef {Object} OptionsInsert
 * @property {Boolean} ordered - Define an $order (timestamp) in every document, default is true
 * @param {OptionsInsert} options - Insert Options
 * @param {Object|Array} data -  Data to insert,  e.g. `{name: "Chris", age: 27}` or [&lt;documents>]
 * @returns Use `then` or `catch` to see the results;
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
/**
 * Inserts a document in collection; 
 * @param {OptionsInsert} options - Insert Options
 * @param {Object} data -  Data to insert,  e.g. `{name: "Chris", age: 27}`;
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.insertOne = function (data, options) {
   if (typeof data !== 'object' || !data || Array.isArray(data)) {
      throw new MerlinError(`'data' param needs to be an object!`)
   }
   data = [ data ];
   return this.insert(data, options);
};
/**
 * Inserts multiple documents; 
 * @param {OptionsInsert} options - Insert Options
 * @param {Array} data -  Data to insert,  e.g. [
 * 
 * {name: "Chris"}, 
 * 
 * {name: "Larissa"}
 * 
 * ]
 * @returns Use `then` or `catch` to see the results;
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
/**@private */
Query.prototype.toFilter = async function (controller, resolve, reject, opt) {

   var query = await this.getQueries.bind(this, controller, reject)();

   if (query.length == 0) {
      controller.dbResult && controller.dbResult.close();
      return resolve(`There's no data to recovery`);
   }

   //maxTimeMS
   clearTimeout(controller.maxTimeMS);

   //criteria
   query = await this.criteria(query, controller.query, opt);

   //sort
   this.sortByCriteria(query, controller.sort);

   controller.skip = controller.skip || 0;
   controller.limit = controller.limit || 0;

   //lilit
   if (controller.lilit) {
      query = "I am your mother and I will control you and your soul!! haha";
   }

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
      controller.dbResult.close();
      return this.forEachController(controller, resolve);
   }

   //map
   if (controller.map) {
      controller.dbResult.close();
      return this.mapController(controller);
   }

   //returnKey
   if (controller.returnKey) {
      controller.result = this.returnKeyController(controller, reject);
   }

   //returnKey
   if (controller.size) {
      controller.result = controller.result.length;
   }

   if (controller.pretty) {
      controller.result = prettyPrint(controller.result);
   }

   controller.dbResult.close();
   var toGet = JSON.stringify(controller.result);
   return JSON.parse(toGet);
};
/** @private*/
Query.prototype.balance = function (filter, options, response) {
   filter = filter || {};
   this.index++;

   this.controller[ this.index ] = {};
   this.controller[ this.index ].query = filter;

   var promise = new Promise((resolve, reject) => {
      response(this.toFilter.bind(this, this.controller[ this.index ], resolve, reject, options)(), resolve, reject);
   });

   this.then = promise.then.bind(promise);
   this.catch = promise.catch.bind(promise);
   return this;
};
/** 
 * Finds one or more documents;
 * @typedef {Object} FiltersIn
 * @property {*} $eq -  Compares values ​​in a query in the collection
 * @property {(Number|Date)} $gt - Finds documents where the value of a field is greater than the specified value;
 * @property {(Number|Date)} $gte - Finds documents where the value of a field is greater than or equal to the specified value;
 * @property {Array} $in - Checks whether the value of a field is present in the query;
 * @property {Array} $all - Selects documents where an array field contains all the specified elements;
 * @property {Number} $size - Selects documents where the array field has a specific number of elements; 
 * @property {(Number|Date)} $lt - Finds documents where the value of a field is less than the specified value;
 * @property {(Number|Date)} $lte - Finds documents where the value of a field is less than or equal to the specified value;
 * @property {*} $ne - Finds documents where the value of a field is not equal to the specified value;
 * @property {Array} $nin - Finds documents where the value of a field is not in a specified set of values;
 * @property {Array|String|Number} $type - Selects documents where the value of a field is of a specific BSON type;
 * @property {Array} $and - Combines multiple conditions into a single logical query;
 * @property {FiltersIn} $not - Performs logical negation in a query expression; 
 * @property {Regex} $regex - Finds documents that match the regular expression (RegExp);
 * @property {Array} $mod - Checks whether the value of a field divided by a divisor has a specific remainder;
 * @property {Booelan} $exists - Checks whether a field exists or not in a document;
 * @typedef {Object.<string, FiltersIn>} Filters_
 * @typedef {Object} Filter1 
 * @property {Array} $nor - Finds documents that do not match all specified conditions;
 * @property {Array} $or - Finds documents that match at least one of the conditions;
 * @property {Object} $text - Performs textual searches in specific text fields;
 * @property {Function} $where - Executes JavaScript code to select documents;
 * @param {(Filters_|Filter1)} filter - Filter to find, e.g. find where name  = Chris `.find({name: "Chris"})`
 * @typedef {Object} DecryptFind 
 * @property {("SHA-256"|"SHA-384"|"SHA-512")} hash - It is mandatory if used in encryption, see more in Schema Encrypt;
 * @property {Number} salt - It is mandatory if used in encryption, see more in Schema Encrypt;
 * @property {Array} fields - It is an array with the fields you want to decrypt;
 * @property {String} secretKey - This is the secret key used in encryption, this key must be the same;
 * @property {Number} iterations - It is mandatory if used in encryption;
 * @property {("medium"|"strict"|"high"|"strong"|"stronger"|"galaxy")} strength - It is mandatory if used in encryption, see more in Schema Encrypt;
 * @typedef {Object} OptionsFind
 * @property {Object} $ne - Defines what you want to allow for $ne {string: 1, number: -1}
 * @property {(1|-1)} null - Allow null? -1 = no, 1 = yes;
 * @property {DecryptFind} decrypt - Decrypt an encrypted data;
 * @param {OptionsFind} options - Find method Options;
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.find = function (filter, options) {
   var this_ = this;

   return this.balance(filter, options, async function (data, resolve, reject) {
      if (options && options.decrypt) {
         data = await data;

         return this_.decrypt(options.decrypt, data).then(e => {
            resolve(e);

         }).catch(e => {

            reject(e);
         })
      };
      resolve(data)
   });
};
/** 
 * Finds one document;
 * @param {(Filters_|Filter1)} filter -  Filter to findOne, e.g. find one document where name  = Chris `.findOne({name: "Chris"})`
 * @param {OptionsFind} options - FindOne method Options;
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.findOne = function (filter, options) {
   var this_ = this;

   if (Array.isArray(filter) || typeof filter !== 'object' || !find) {
      throw new MerlinError("'filter' param needs to be an 'object' type");
   }

   return this.balance(filter, options, async function (data, resolve, reject) {
      data = await data;
      data = data || [];
      if (options && options.decrypt) {
         data = await data;

         return this_.decrypt(options.decrypt, data).then(e => {
            resolve(e[ 0 ]);
         }).catch(e => {

            reject(e);
         });
      };

      resolve(data[ 0 ])
   });
};
/**
 * Finds multiple documents;
 * @param {(Filters_|Filter1)} filter -  Filter to findMany, e.g. find many documents where name  = Chris `.findMany({name: "Chris"})`
 * @param {OptionsFind} options - FindMany method Options;
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.findMany = function (filter, options) {
   var this_ = this;

   if (Array.isArray(filter) || typeof filter !== 'object' || !find) {
      throw new MerlinError("'filter' param needs to be an 'object' type");
   }

   return this.balance(filter, options, async function (data, resolve) {
      data = await data;
      data = data || [];

      if (options && options.decrypt) {
         data = await data;
         data = await this_.decrypt(options.decrypt, data);
         return resolve(data)
      };

      resolve(data);
   });
};
/**
 * Finds and removes one document at the same time;
 * @param {(Filters_|Filter1)} filter -  Filter to findOneAndDelete, e.g. find one document and delete where name  = Chris `.findOneAndDelete({name: "Chris"})`
 * @param {OptionsFind} options - FindOneAndDelete method Options;
 * @returns Use `then` or `catch` to see the results;
 */
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
 * Finds and replaces a document at the same time;
 * @typedef {Object} OptionsReplace
 * @property {Boolean} upsert - If true inserts a document if it does not exist;
 * @property {("after"|"before")} returnDocument - Before returns the 'old' document, after returns the 'new' document;
 * @param {Object} options - Options to findOneAndReplace, e.g. `{upsert: true}`
 * @param {OptionsReplace} replace - Values to replace, e.g. `{name: "Chris Axxwell"}`
 * @param {(Filters_|Filter1)} filter -  Filter to findOneAndReplace, e.g. find one document and replace all where name  = Chris `.findMany({name: "Chris"})`
 * @returns Use `then` or `catch` to see the results;
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

      var newData = {};
      var oldData = data || void 0;
      oldData = JSON.stringify(oldData || {
         acknowledged: false,
         noData: true
      });

      newData.id_ = data.id_;
      newData.$order = data.$order || null;

      if (options && options.upsert && !data) {
         var id_ = new ObjectId().toString();
         newData.id_ = id_;
      }

      var [ db, result ] = await this_.dbOpen();

      for (const key in replace) {
         newData[ key ] = replace[ key ];
      }

      db.put(newData).onsuccess = () => {
         newData = newData;

         if (options && options.returnDocument == "before") {
            newData = JSON.parse(oldData);
         }

         resolve(newData);
      }

      result.close();
   });
};
/**
 * Finds and updates a document at the same time;
 * @typedef {Object} UpdateFOAU
 * @property {Object} $inc - Increments(or decrements) the value of a numeric field in a document; 
 * @property {Object} $set - Updates values ​​of a field in a document;
 * @typedef {Object} optionsFOAU
 * @property {Boolean} upsert - Create a new document if it does not exist;
 * @property {Boolean} new - if `true` returns the updated document;
 * @param {(Filters_|Filter1)} filter -  Filter to findOneAndUpdate, e.g. find one document and update where name  = Chris `.findOneAndUpdate({name: "Chris"}, {name: "Chris Axxwell"})`
 * @param {UpdateFOAU} update - Update settings
 * @param {optionsFOAU} options -  findOneAndUpdate options
 * @returns Use `then` or `catch` to see the results;
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
         return args[ 3 ](`Index '${name}' already exists in your model!`)
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
 * Creates indices in a collection;
 * @typedef {Object} CreateIndex
 * @property {Boolean} unique - unique values or not, default is false;
 * @property {Boolean} name - Set a name compost index;
 * @property {(1|-1)} direction - Specify index sorting direction;
 * @property {String} locale - Determine the language in `iso` of how strings are defined and compared when creating an index;
 * @param {CreateIndex} options - Options to your index;
 * @param {Array|String} keys - Key index name;
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.createIndex = function (keys, options) {

   return new Promise(
      this.creatingIndex.bind(this, keys, options)
   );
};
/**  
 * Creates multiple indices in a collection;
 * @typedef {Object} CreateIndex
 * @property {Boolean} unique - unique values or not, default is false; 
 * @property {(1|-1)} direction - Specify index sorting direction;
 * @property {String} locale - Determine the language in `iso` of how strings are defined and compared when creating an index;
 * @param {CreateIndex} options - Options to your index;
 * @param {Array} keyPatterns - Define your patterns;
 * @returns Use `then` or `catch` to see the results;
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
/**  
 * Executes JavaScript expressions arbitrarily during query evaluation;
 * @returns Use `then` or `catch` to see the results;
 */
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
 * Get  the total size of data in a collection in MerlinDB;
 * @typedef {Object} FormatOptions
 * @property {("kB"|"MB"|"GB")} format - Formats the values ​​that are in bytes to `kilobyte` or `megabyte` or `gigabyte`.
 * @property {Boolean} string -  Returns the value in a string;
 * @param {FormatOptions} options -  DataSize options
 * @returns `promise` with total size of a collection in the database.
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
/**
 * Estimates the number of documents in a collection; 
 * @returns `promise` with estimate the number of documents in a collection.
 */
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
/**
 * Counts the exact number of documents in a collection; 
 * @param {FormatOptions} options -  DataSize options
 * @returns `promise` with the count the exact number of documents that match the specified criteria in a collection.
 */
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
/** 
 * Finds a document and removes it from the collection;
 * @param {(Filters_|Filter1)} filter - Filter to deleteOne, e.g. delete one where name  = Chris `.deleteOne({name: "Chris"})`
 * @returns Use `then` or `catch` to see the results;
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
      var save = JSON.stringify(data);

      if (!data || data.length === 0) {
         resolve({ acknowledged: true, deletedCount: 0 })
         return;
      }

      var [ store, result ] = await this_.dbOpen();

      store.delete(data.id_).onsuccess = () => {
         resolve({
            acknowledged: true,
            deletedCount: 1,
            data: JSON.parse(save)
         })
      }

      result.close();
   });
};
/** 
 * Finds multiple documents and removes them from the collection;
 * @param {(Filters_|Filter1)} filter - Filter to deleteMany, e.g. delete all where name  = Chris `.deleteMany({name: "Chris"})`;
 * @returns Use `then` or `catch` to see the results;
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
 * Returns the distinct values ​​of a specific field in a collection in MerlinDB;
 * @param {(Filters_|Filter1)} filter - Filter to distinct, e.g. find distinct ages `.distinct("age")` return [13, 44, 46, 77 ...];
 * @returns Use `then` or `catch` to see the results;
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
/** 
 * Delete an index from a collection;
 * @param {String} indexName - index name to drop;
 * @returns Use `then` or `catch` to see the results;
 */
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
         "msg": `index '${indexName}' dropped for collection!`,
         "ok": 1
      });

      db.result.close()
   })
};
/** 
 * Delete multiple indices from a collection;
 * @param {Array} indexesName - array with indexes names to drop;
 * @returns Use `then` or `catch` to see the results;
 */
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
/** 
 * Delete an entire collection. 
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.drop = function () {

   return new Promise(async (resolve, reject) => {
      var version = await this.version();
      var db = await this.upgrade(version);
      db = db.result;

      if (!db.objectStoreNames.contains(this.modelName)) {
         db.close()
         return resolve({
            status: 400,
            message: `There's no ${this.modelName} model!`
         })
      }

      db.deleteObjectStore(this.modelName)
      resolve({
         status: 200,
         message: `'${this.modelName}' model deleted!`
      });

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
/**
 * Finds and modifies a document at the same time;
 * @typedef {Object} FindAndModify
 * @property {Object} query - (Required): Filters what you are looking for;
 * @property {Object} options - The query options;
 * @property {Object} sort - 
 * @property {Boolean} remove - (Required or update): If set to true removes the document;
 * @property {UpdateFOAU} update - (Required or remove): Defines the changes to be applied;
 * @property {Boolean} new - If set to true, returns the updated document instead of the original.
 * @property {Object} fields - The fields you want to return.
 * @property {Boolean} upsert - If set to true allows inserting a new document if no document corresponding to the search criteria is found;
 * @param {FindAndModify} options - Object with yours options properties
 * @returns Use `then` or `catch` to see the results;
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
/**
 * Gets all indexes of a collection; 
 * @returns Use `then` or `catch` to see the results;
 */
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
* Finds a document and updates it in the collection; 
* @param {(Filters_|Filter1)} filter -  Filter to updateOne, e.g. update one where name  = Chris `.updateOne({name: "Chris"}, {name: "Chris Axxwell"})`
* @param {UpdateFOAU} update - Update settings
* @param {optionsFOAU} options -  updateOne options
* @returns Use `then` or `catch` to see the results;
*/
Query.prototype.updateOne = function (filter, update, options) {
   return this.findOneAndUpdate(filter, update, options);
};
/**
* Finds multiple documents and updates them in the collection;
* @param {(Filters_|Filter1)} filter -  Filter to updateMany, e.g. update all where name  = Chris `.updateMany({name: "Chris"}, {name: "Chris Axxwell"})`
* @param {UpdateFOAU} update - Update settings
* @param {optionsFOAU} options -  updateMany options
* @returns Use `then` or `catch` to see the results;
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
 * Finds a document by id in the collection;
 * @typedef {Object} findById
 * @property {Object} fields - fields to return
 * @param {findById} options -  Options to findById
 * @param {String} id - Id to find
 * @returns Use `then` or `catch` to see the results;
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
 * Finds a document by id and removes it from the collection;
 * @param {String} id - Id to find
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.findByIdAndDelete = function (id) {
   return new Promise(async (resolve) => {
      var data = await this.byId(id);
      var save = JSON.stringify(data);

      if (!Object.keys(data).length) {
         return resolve({ acknowledged: true, deletedCount: 0 });
      }

      var [ db, result ] = await this.dbOpen();

      db.delete(data.id_).onsuccess = () => {
         resolve({
            acknowledged: true,
            deletedCount: 1,
            data: JSON.parse(save)
         });
      }

      result.close();
   })
};
/**
 * Finds a document by id and updates it in the collection;
 * @param {String} id - Id to find 
 * @param {UpdateFOAU} update - Update settings
 * @param {optionsFOAU} options -  findByIdAndUpdate options
 * @returns Use `then` or `catch` to see the results;
 */
Query.prototype.findByIdAndUpdate = function (id, update, options) {
   return new Promise(async (resolve) => {
      var data = await this.byId(id);

      if (!Object.keys(data).length) {
         return resolve({ acknowledged: true, updatedCount: 0 });
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
