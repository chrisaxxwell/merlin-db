import { MerlinOperatorsError } from "./errors.js";

function Operators() {
   this.entries = Object.entries;
   this.typesIndex = [
      void 0,
      void 0,
      'string', //2
      'object',//3
      'array', //4
      void 0,
      'undefined', //6
      void 0,
      'boolean', //8
      'date', //9
      void 0,
      void 0,
      void 0,
      void 0,
      'symbol', //14
      void 0,
      'number' //16
   ];
};

/**@private */
Operators.prototype.$eq = function () {
   return this.command(arguments[ 0 ] !== arguments[ 1 ]);
}
/**@private */
Operators.prototype.$gt = function () {
   this.errorNumber(arguments[ 0 ], "$gt");
   return this.command(arguments[ 0 ] >= arguments[ 1 ]);
}
/**@private */
Operators.prototype.$gte = function () {
   this.errorNumber(arguments[ 0 ], "$gte");
   return this.command(arguments[ 0 ] > arguments[ 1 ]);
}
/**@private */
Operators.prototype.checkIn = function (args) {
   var negate = true;
   args[ 0 ].forEach(item => {
      if (item === args[ 1 ]) negate = false;
      if (item instanceof RegExp && item.test(args[ 1 ])) negate = false;
   });

   return negate;
}
/**@private */
Operators.prototype.$in = function () {
   this.errorArray(arguments[ 0 ], "$in");

   return this.command(this.checkIn(arguments));
}
/**@private */
Operators.prototype.$lt = function () {
   this.errorNumber(arguments[ 0 ], "$lt");
   return this.command(arguments[ 0 ] <= arguments[ 1 ]);
}
/**@private */
Operators.prototype.$lte = function () {
   this.errorNumber(arguments[ 0 ], "$lte");
   return this.command(arguments[ 0 ] < arguments[ 1 ]);
}
/**@private */
Operators.prototype.$ninArray = function (args) {
   if (typeof args[ 0 ] && Array.isArray(args[ 0 ])) {
      var cheched = false;
      args[ 0 ].forEach(e => {
         if (e instanceof RegExp) {
            if (e.test(args[ 1 ])) {
               cheched = true
            }
         } else {
            if (e === args[ 1 ]) {
               cheched = true;
            }
         }
      });
   };

   return cheched;
}
/**@private */
Operators.prototype.$ne = function () {
   this.errorNe(arguments[ 0 ], "$ne", arguments[ 2 ]);
   return this.command(arguments[ 0 ] === arguments[ 1 ]);
}
/**@private */
Operators.prototype.$nin = function () {
   this.errorNe(arguments[ 0 ], "$nin", arguments[ 2 ]);

   if (typeof arguments[ 0 ] && !Array.isArray(arguments[ 0 ])) {
      throw new Error("Ivaliasd as '$ne'")
   }

   if (typeof arguments[ 0 ] && Array.isArray(arguments[ 0 ])) {
      return this.$ninArray(arguments);
   }
}
/**@private */
Operators.prototype.firstEnc = function (args, query, opt) {
   args = this.entries(args)[ 0 ];
   return this[ args[ 0 ] ](args[ 1 ], query);
}
/**@private */
Operators.prototype.$and = function (args, query, opt) {
   var negate = false;

   this.entries(args).forEach(e => {
      if (this.firstEnc(e[ 1 ], query[ e[ 0 ] ])) {
         negate = true;
      }
   });

   return negate;
}
/**@private */
Operators.prototype.$not = function (args, query) {
   var negate = false;
   args = this.entries(args)[ 0 ];

   if (!this[ args[ 0 ] ](args[ 1 ], query)) {
      negate = true;
   }

   return negate;
}
/**@private */
Operators.prototype.$nor = function (args, query) {
   var negate = false;
   var this_ = this;

   args.forEach(item => {
      item = this.entries(item)[ 0 ]
      if (typeof item[ 1 ] === "object") {
         var oper = this.entries(item[ 1 ])[ 0 ];

         if (!this_[ oper[ 0 ] ](oper[ 1 ], query[ item[ 0 ] ])) {
            negate = true;
         }
      } else {
         if (query[ item[ 0 ] ] === item[ 1 ]) {
            negate = true;
         }
      }
   });

   return negate
}
/**@private */
Operators.prototype.$or = function (args, query) {
   var negate = true;
   var this_ = this;

   args.forEach(item => {
      item = this.entries(item)[ 0 ]
      if (typeof item[ 1 ] === "object") {
         var oper = this.entries(item[ 1 ])[ 0 ];

         if (!this_[ oper[ 0 ] ](oper[ 1 ], query[ item[ 0 ] ])) {
            negate = false;
         }
      } else {
         if (!query[ item[ 0 ] ] !== item[ 1 ]) {
            negate = false;
         }
      }
   });

   return negate
}
/**@private */
Operators.prototype.$regex = function () {
   var args = arguments;

   if (!this.regexTransformer(args[ 0 ]).test(args[ 1 ])) {
      return true
   }
}
/**@private */
Operators.prototype.regexTransformer = function (regex) {

   if (regex instanceof RegExp || typeof regex === "string") {
      return new RegExp(regex);

   } else if (
      Array.isArray(regex)
      && regex.length >= 1
      && typeof regex[ 0 ] === "string") {

      return new RegExp(regex[ 0 ], regex[ 1 ] || "");
   } else {
      throw new Error(`Invalid regex ${regex}`)
   }
}
/**@private */
Operators.prototype.$exists = function () {
   var args = arguments;
   var this_ = this;
   var exists = args[ 1 ][ 0 ][ args[ 1 ][ 1 ] ];
   var negate = 0;

   if (typeof args[ 0 ] !== "boolean") {
      throw new MerlinOperatorsError(`Invalid type '${args[ 0 ]}'`)
   }
   this.entries(args[ 1 ][ 2 ]).forEach(e => {
      if (e[ 0 ] !== "$exists") {
         if (this_[ e[ 0 ] ](e[ 1 ], exists) && exists) {
            negate++
         }
      }
   });

   if (!exists) negate++;
   if (!args[ 0 ]) negate++;

   return negate == 1;
}
/**@private */
Operators.prototype.$type = function () {
   var args = arguments;
   var negate = true;

   args[ 0 ] = Array.isArray(args[ 0 ]) ? args[ 0 ] : Array(args[ 0 ]);
   args[ 0 ] = this.typesIndex[ args[ 0 ] ] || args[ 0 ];
   args[ 1 ] = !args[ 3 ][ args[ 4 ] ] ? undefined : args[ 1 ];

   if (args[ 0 ].indexOf(typeof args[ 1 ]) !== -1) {
      negate = false;
   }

   return negate;
}
/**@private */
Operators.prototype.$mod = function () {
   var args = arguments;
   var negate = true;

   if ((args[ 1 ] % args[ 0 ][ 0 ] === args[ 0 ][ 1 ])) {
      negate = false;
   }

   return negate;
}
/**@private */
Operators.prototype.$text = function () {
   var args = arguments;
   var negate = true;
   var search = Object.values(args[ 0 ]);
   var regex = new RegExp(search[ 0 ]);

   if (regex.test(args[ 1 ][ search[ 1 ] ])) {
      negate = false;
   }

   return negate;
}
/**@private */
Operators.prototype.$where = function () {
   var args = arguments[ 0 ];
   var negate = true;
   if (args[ 0 ].call(args[ 1 ])) {
      negate = false;
   }
   return negate;
}
/**@private */
Operators.prototype.$all = function () {
   var args = arguments;
   var negate = true;
   if (!args[ 3 ][ args[ 4 ] ]) {
      return true;
   }

   if (args[ 0 ].every(item => args[ 3 ][ args[ 4 ] ].includes(item))) {
      negate = false;
   }

   return negate;
}
/**@private */
Operators.prototype.$size = function () {
   var args = arguments;
   var negate = true;
   if (!args[ 3 ][ args[ 4 ] ]) return true;

   if (args[ 3 ][ args[ 4 ] ].length == args[ 0 ]) {
      negate = false;
   }

   return negate;
}
/**@private */
Operators.prototype.setValue = function (obj, path, value, inc) {
   var keys = path.split('.');
   var lastKey = keys.pop();
   var target = keys.reduce((o, key) => o[ key ] = o[ key ] || {}, obj);

   if (inc) {
      !target[ lastKey ] && (target[ lastKey ] = 0);
      target[ lastKey ] += value;
      return target;
   }

   target[ lastKey ] = value;
   return target;
}
/**@private */
Operators.prototype.$set = function (update, data, upsert) {
   if (!data && upsert) {
      data = {};
   }
   for (const key in update) {
      this.setValue(data, key, update[ key ]);
   };

   return data;
}
/**@private */
Operators.prototype.$inc = function (update, data) {
   if (!data) {
      return {}
   }

   for (const key in update) {
      this.setValue(data, key, update[ key ], 'inc');
   };

   return data;
}
/**@private */
Operators.prototype.command = function () {
   if (arguments[ 0 ]) {
      return true;
   }
}
/**@private */
Operators.prototype.errorNumber = function () {
   if (typeof arguments[ 0 ] !== "number") {
      throw new MerlinOperatorsError(`'${arguments[ 1 ]}' needs to be a number!`);
   }
}
/**@private */
Operators.prototype.errorNe = function () {
   if (!arguments[ 2 ].null || !arguments[ 2 ].$ne) return;

   if (arguments[ 2 ].null === -1) {
      throw new MerlinOperatorsError(`'null' is not allowed!`);
   }

   if (arguments[ 2 ].$ne[ typeof arguments[ 0 ] ] == -1) {
      throw new MerlinOperatorsError(`'${arguments[ 0 ]}' is an invalid value!`);
   }
}
/**@private */
Operators.prototype.errorArray = function () {
   if (!Array.isArray(arguments[ 0 ])) {
      throw new MerlinOperatorsError(`'${arguments[ 1 ]}' needs to be an array!`);
   }
}


export default Operators;