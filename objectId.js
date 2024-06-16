function ObjectId() {
   if (!(this instanceof ObjectId)) {
      return new ObjectId();
   }
   return this;
}

function generate(counter) {
   var timestamp = Math.floor(Date.now() / 1000).toString(16);
   var machineIdentifier = btoa(navigator.userAgent).substring(0, 6);
   var processId = Math.floor(Math.random() * 65535).toString(16).padStart(4, '0');
   counter = (counter + 1) % 16777215;
   var counterString = counter.toString(16).padStart(6, '0');

   return timestamp + machineIdentifier + processId + counterString;
}

/** 
 * @returns {String} Generates a new unique 'ObjectId'.
 */
ObjectId.prototype.toString = function () {
   let counter = Math.floor(Math.random() * 16777215);
   return generate(counter)
}

/** 
 * @param {Number} size - String size
* @returns {String} Generates a new unique 'ObjectId' with free size.
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
