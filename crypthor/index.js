
/**
 * @author Chris Axxwell <@chrisaxxwell> 
 * @typedef {Object} Options 
 * @property {("SHA-256"|"SHA-384"|"SHA-512")} hash - aa 
 * @property {Number} salt - aa  
 * @property {Number} iterations - aa   
 * @property {("medium"|"strict"|"high"|"strong"|"stronger"|"galaxy")} strength -  aa
 * @param {Options} options - aa
 * @returns {Options} - aa  
 * @since 1.0.0
 */
function CrypThor(options) {
   if (!(this instanceof CrypThor)) {
      return new CrypThor(options)
   }

   options = options || {};

   /** @protected*/
   this.salt = options.salt;
   /** @protected*/
   this.hash = options.hash || "SHA-256";
   /** @protected*/
   this.strength = options.strength || false;
   /** @protected*/
   this.iterations = options.iterations || 100000;
   /** @protected*/
   this.txEnc = window.TextEncoder;
   /** @protected*/
   this.uint8 = window.Uint8Array;
   /** @protected*/
   this.securityFactor = options.securityFactor || 10;
   /** @protected*/
   this.crypto = window.crypto;

   if (this.strength) {
      var strength = {
         medium: [ "SHA-256", 22, 200000, 8 ],
         high: [ "SHA-384", 30, 300000, 7 ],
         strict: [ "SHA-512", 40, 500000, 6 ],
         strong: [ "SHA-512", 60, 600000, 5 ],
         stronger: [ "SHA-512", 100, 1000000, 4 ],
         galaxy: [ "SHA-512", 300, 10000000, 3 ],
      }[ this.strength ];

      if (!strength) {
         throw new Error(`Invalid '${this.strength}' type in 'strength' param!`);
      }
      this.salt = strength[ 1 ];
      this.hash = strength[ 0 ];
      this.iterations = strength[ 2 ];
   }

   return this;
}

/**@private */
CrypThor.prototype.setError = function (cond, msg) {
   if (!cond) {
      throw new Error(msg);
   }
};

CrypThor.prototype.encrypt = async function (string, secretKey) {

   var iv = this.crypto.getRandomValues(new this.uint8(16));
   var cipherKey = await this.key(secretKey);
   var encoded = new this.txEnc().encode(string);

   var encrypted = await this.crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cipherKey,
      encoded
   );
   var encryptedBytes = new this.uint8(encrypted);
   var result = new this.uint8(iv.length + encryptedBytes.length);
   result.set(iv);
   result.set(encryptedBytes, iv.length);

   return btoa(String.fromCharCode(...result));
};

CrypThor.prototype.decrypt = function (ciphertext, secretKey) {
   return new Promise(async (resolve, reject) => {

      try {
         var data = this.uint8.from(atob(ciphertext), c => c.charCodeAt(0));
         var iv = data.slice(0, 16);
         var encrypted = data.slice(16);
         var cipherKey = await this.key(secretKey);

         var decrypted = await this.crypto.subtle.decrypt(
            { name: "AES-CBC", iv },
            cipherKey,
            encrypted
         );

         resolve(new TextDecoder().decode(decrypted));
      } catch (error) {
         reject("Invalid 'secret key'");
      }
   })
};

/**@private */
CrypThor.prototype.key = async function (string) {

   var encoder = new this.txEnc();
   var keyMaterial = await this.crypto.subtle.importKey(
      "raw",
      encoder.encode(string),
      { name: "PBKDF2" },
      false,
      [ "deriveBits", "deriveKey" ]
   );

   return this.crypto.subtle.deriveKey({
      "name": "PBKDF2",
      salt: new this.uint8(this.salt),
      "iterations": Math.max(100, this.iterations),
      "hash": this.hash
   },
      keyMaterial,
      { "name": "AES-CBC", "length": 256 },
      true,
      [ "encrypt", "decrypt" ]
   );
};

/* var crypt = new CrypThor({
"hash": ""
});

var encrypted = await crypt.encrypt("tenho grana", "4001");
console.log(encrypted);

var decrypted = await crypt.decrypt(encrypted, "4001")
console.log(decrypted); */


export default CrypThor;