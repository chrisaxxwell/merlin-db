function shortStack(t) {
   if (t.stack) {
      const stackLines = t.stack.split('\n');
      t.stack = stackLines.map(line => {
         const match = line.match(/\((http:\/\/.*?\/)([^\/]+\/.*):(\d+:\d+)\)/);
         if (match) {
            return line.replace(match[ 1 ], '/');
         }
         return line;
      }).join('\n');
   }
}

class MerlinError extends Error {
   constructor(message) {
      super(message);
      this.name = "MerlinDB Error 🧙‍♂️";
      shortStack(this);
   }
}

class MerlinOperatorsError extends Error {
   constructor(message) {
      super(message);
      this.name = "MerlinDB Operators Error 🧙‍♂️";
      shortStack(this);
   }
}

class MerlinInvalidOptionError extends Error {
   constructor(message) {
      super(message);
      this.name = "MerlinDB Invalid Option Error 🧙‍♂️";
      shortStack(this);
   }
}

export {
   MerlinOperatorsError,
   MerlinInvalidOptionError,
   MerlinError
}