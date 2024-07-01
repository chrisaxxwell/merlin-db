/**
 * Generates a new ObjectId
 * @constructor
 * @returns new ObjectId
 */
function ObjectId() {
   if (!(this instanceof ObjectId)) {
      return new ObjectId();
   }
   return this;
}

/** @private */
function generate(counter) {
   var timesp = Math.floor(Date.now() / 1000).toString(16);
   var machId = btoa(navigator.userAgent).substring(0, 6);
   var processId = Math.floor(Math.random() * 65535).toString(16).padStart(4, '0');
   counter = (counter + 1) % 16777215;
   var counStr = counter.toString(16).padStart(6, '0');

   return timesp + machId + processId + counStr;
}

/**  
 * @returns A  new unique 'ObjectId' string.
 */
ObjectId.prototype.toString = function () {
   let counter = Math.floor(Math.random() * 16777215);
   return generate(counter)
}

/** 
 * @param {Number} size - String size
* @returns Generated  a new unique 'ObjectId' with free size.
 */
ObjectId.prototype.unlimited = function (size) {
   size = size || 24;
   var result = '';
   var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;

   for (var i = 0; i < size; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

export default ObjectId;
