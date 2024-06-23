import CrypThor from "./crypthor/index.js";
import ObjectId from "./objectId.js";
import regex from "./regex.js";

function Validator(data, schema, query) {
   this.data = data;
   this.schema = schema;
   this.query = query;

   return new Promise(resolve => {

      resolve(this.validateSchema());
   });
}

Validator.prototype.validateSchema = async function () {

   for (var item of this.data) {
      for (var key in this.schema) {
         var rules = this.schema[ key ];
         var field = item[ key ];

         var valField = await this.validateField(field, rules, key, item);

         if (valField) {
            return valField;
         }
      }

      delete item.$message;

      var invalidKey = Object.keys(item).find(key => !(key in this.schema));

      if (!!invalidKey) {
         return `${invalidKey} is not a valid property!`
      }
   }

   return this.data;
}

Validator.prototype.validateField = async function (field, rules, key, data) {

   //required
   if (typeof rules.required === 'function' && rules.required.call(data)) {

      var message = data.$message || `Invalid ${key}!`;
      return message;
   }

   if (rules.required && [ void 0, null ].includes(field)) {
      var message = rules.required[ 1 ] || `${key} is required!`;
      return message;
   }

   //type
   var haveValue = (!!field || field === '');
   rules.type = rules.type || rules;

   if (rules.type && haveValue) {
      message = void 0;

      if (typeof rules.type[ 1 ] === 'string') {
         message = rules.type[ 1 ];
         rules.type = rules.type[ 0 ];
      }

      var types = rules.type.toString();

      types = types.match(/(Date|Function|String|Number|Array|Object)/g, "");
      types = types.join(", ").toLowerCase();

      var check = types.indexOf(typeof field) === -1;

      message = message || `Type of ${key} needs to be an ${types}!`;

      if (types.indexOf('date') !== -1 && !this.isDate(field)) {
         return message;
      }

      if (types.indexOf('array') !== -1
         && !Array.isArray(field) && check) {
         return message;
      }

      if (check && types.indexOf('date') === -1
         && types.indexOf('array') === -1) {
         return message;
      }
   }

   //validate email
   if (rules.validateEmail) {
      var email = rules.validateEmail;
      var regx = email[ 2 ] || regex.email;
      regx = new RegExp(regx);

      if (typeof field !== 'string' || !regx.test(field)) {
         return email[ 1 ] || 'invalid email';
      }
   }

   //encrypt 
   if (rules.encrypt) {
      var crypt = new CrypThor(rules.encrypt);
      crypt = await crypt.encrypt(field[ 0 ], field[ 1 ]);
      data[ key ] = crypt;

   }

   //min
   if (rules.min) {
      var min = rules.min[ 0 ] || rules.min;

      if (min > field) {
         return this.convertMsg(rules.min[ 1 ], field)
            || `The min allowed for ${key} is ${min}!`;
      }
   }

   //max
   if (rules.max) {
      var max = rules.max[ 0 ] || rules.max;

      if (max < field) {
         return this.convertMsg(rules.max[ 1 ], field)
            || `The max allowed for ${key} is ${max}!`;
      }
   }

   //maxLength
   if (rules.maxLength) {
      var mLength = rules.maxLength;
      var max = mLength[ 0 ] | mLength;

      if (field.length > max) {
         return this.convertMsg(mLength[ 1 ], field)
            || `The value ${field} has a lot of characters; it's quite long.`;
      }
   }

   if (rules.minList) {

      if (field.length < (rules.minList[ 0 ] || rules.minList)) {
         return rules.maxList[ 1 ] || `You need at least ${rules.minList} ${key}!`
      }
   }

   if (rules.maxList) {

      if (field.length > (rules.maxList[ 0 ] || rules.maxList)) {
         return rules.maxList[ 1 ] || `Maximum ${rules.maxList} ${key} are allowed!`;
      }
   }

   //minLength
   if (rules.maxLength) {
      var nLength = rules.minLength;
      var min = nLength[ 0 ] | nLength;
      if (field.length < min) {
         return this.convertMsg(nLength[ 1 ], field)
            || `The value ${field} has very few characters! it's quite short.`;
      }
   }

   //enum
   if (rules.enum) {
      var enum_ = rules.enum.values;
      message = this.convertMsg(rules.enum.message, field);
      message = message || `Only ${enum_.join(", ")} is allowed!`;
      if (!enum_.includes(field)) {
         return message;
      }
   }

   //validator
   if (rules.validate && haveValue) {
      if (!rules.validate.validator(field)) {

         if (rules.validate.message &&
            typeof rules.validate.message === 'function') {
            return rules.validate.message({ value: field });
         }

         return this.convertMsg(rules.validate.message, field)
            || `${field} is not a valid value!`;
      }
   }

   //unique
   if (rules.unique && await this.unique(field, key)) {
      var message = this.convertMsg(rules.unique[ 1 ], field)
         || `'${field}' ${key}, already exists!`;
      return message;
   }

   return false;
}

Validator.prototype.isDate = function (value) {
   if (
      value < 0
      || new Date(value) === 'Invalid Date'
      || value === null
      || value > 6249223105200000
      || !isFinite(value)
      || typeof value === 'boolean'
   ) {
      return false;
   }

   return true;
}

Validator.prototype.convertMsg = function (message, field) {
   if (!message) return void 0;
   return message.replace("{VALUE}", field);
}

Validator.prototype.unique = function (field, key) {
   var query = this.query;
   var merlin = query.merlin;
   var open = merlin.dbApi.open(merlin.dbName);

   return new Promise(resolve => {

      open.onsuccess = (e) => {

         var result = e.target.result;

         if (!result.objectStoreNames.contains(query.modelName)) {
            result.close();
            return resolve(false);
         }

         var trans = result.transaction([ query.modelName ], 'readonly');
         var store = trans.objectStore(query.modelName);
         var index = store.index(key);
         var get = index.get(field);

         get.onsuccess = e => {

            if (e.target.result) {
               return resolve(true);
            }

            resolve(false);
         }

         result.close();
      }
   })
}

export default Validator; 