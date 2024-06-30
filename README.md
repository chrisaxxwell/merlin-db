![Logo](https://github.com/chrisaxxwell/merlin-db/blob/main/merlin-logo.svg)

# MerlinDB

MerlinDB was developed to simplify and improve the use of the IndexedDB API in web browsers. MerlinDb allows developers to `add`, `get`, `update` and `remove` data at scale, providing a fluid and effective experience. Inspired by the renowned MongoDB.

## Installation

Install **merlinDB** with **npm** or **[download](https://merlindb.chrisaxxwell.com/download)**

```bash
  npm install @chrisaxxwell/merlin-db
```

## Usage/Examples

```javascript
import MerlinDB, { Schema } from "@chrisaxxwell/merlin-db";
//Or if you are using 'merlindb.min.js' just call 'new MerlinDB()';
```

Call the `new MerlinDB()`:

```javascript
const merlin = new MerlinDB();
```

Connect to database:

```javascript
merlin.connect(<YOUR-DATABASE-NAME>);
```

Create an Schema:

```javascript
var usersSchema = Schema({
  email: {
    type: String,
    unique: true,
  },
  name: { type: [String], required: true },
  age: [Number, String],
  city: String,
});
```

Initialize your new model:

```javascript
const Users = merlin.model("Users", usersSchema);
```

CRUD (Insert, Update and Remove):

```javascript
//Insert
Users.insert({ name: "Chris", age: 27 }).then((e) => console.log(e));

//Find
Users.find({ age: 27 }).then((e) => console.log(e));

//Update
Users.updateOne(
  {
    //Every name = Sophie
    name: { $regex: ["Sophie", "i"] },
  },
  { $set: { name: "Lady Sophie" } }
);

//Delete
Users.deleteOne({ name: "Chris" }).then((e) => console.log(e));
```

Full code:

```javascript
import MerlinDB, {Schema} from "@chrisaxxwell/merlin-db";

const merlin = new MerlinDB();
merlin.connect(<YOUR-DATABASE-NAME>);

var usersSchema = Schema({
   email: {
      type: String,
      unique: true
   },
   name: { type: [ String ], required: true },
   age: [ Number, String ],
   city: String,
});


Users.insert({ name: "Chris", age: 27 }).then(e => console.log(e));

Users.find({ age: 27 }).then(e => console.log(e));

Users.updateOne({

   name: { $regex: ["Sophie", "i"] } },
   { $set: { name: "Lady Sophie" }
});

Users.deleteOne({ name: "Chris" }).then(e => console.log(e));
```

## Documentation

To see full [documentation](https://merlindb.chrisaxxwell.com) access https://merlindb.chrisaxxwell.com.

## FAQ

#### - Why MerlinDB?

MerlinDB was carefully developed to simplify and improve the use of the IndexedDB API in web browsers. MerlinDb allows developers to add, get, update and remove data at scale, providing a fluid and effective experience. Inspired by the renowned MongoDB and Mongoose, MerlinDB is a sophisticated and intuitive tool especially designed for those familiar with MongoDB and Mongoose. Its intuitive interface and powerful features make it the ideal choice for professionals looking for superior productivity and performance in their web development projects.

#### - Where can I see a basic tutorial?

Access https://merlindb.chrisaxxwell.com/docs

#### - How can I use encryption in merlinDB?

`Encrypt`: https://merlindb.chrisaxxwell.com/manual/reference/insert/

`Decrypt`: https://merlindb.chrisaxxwell.com/manual/reference/find/

#### - How to test quickly??

`Encrypt`: https://merlindb.chrisaxxwell.com/admin/

#### - Its free?

**YUP** totally free

## Color Reference

| Color   | Hex                                                              |
| ------- | ---------------------------------------------------------------- |
| color-1 | ![#250649](https://via.placeholder.com/10/250649?text=+) #250649 |
| color-2 | ![#2d0c55](https://via.placeholder.com/10/2d0c55?text=+) #2d0c55 |
| color-3 | ![#3f1e71](https://via.placeholder.com/10/3f1e71?text=+) #3f1e71 |

## Authors

- [@chrisaxxwell](https://www.github.com/chrisaxxwell)

## Feedback

If you have any feedback, please reach out to us at chrisaxxwell@gmail.com

## Support

For support, email chrisaxxwell@gmail.com or join our Slack channel.

## License

[MIT](https://choosealicense.com/licenses/mit/)
