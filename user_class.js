/**
 * Author: George Kochera
 * Date: 5/24/2021
 * File: user_class.js
 * Description: Contains all the functions for manipulating, storing and handling Users
 */

// User Object Definition
/*
    { 
        "id": "abc123",                           # Automatically generated by Datastore
        "sub": "202084202",                       # The Google Subscriber Number related to the User
        "first_name": "George",                   # The type of the boat, power boat, sailboat, catamaran etc. a string
        "last_name": "Kochera",                   # The length of the boat
        "self":"https://appspot.com/boats/abc123" # Optional
    }
*/

var http = require('http')
var datastore = require('./database');
var h = require('./helper');

module.exports = class User
    {
        constructor(data, request=null, gDatastore=false)
        {
            if (gDatastore)
            {
                this.id = data[datastore.KEY].id.toString()
                this.sub = data.sub;
                this.first_name = data.first_name;
                this.last_name = data.last_name;
                this.account_created = data.account_created;
                this.key = data[datastore.KEY];
                this.self = request.protocol + "://" + request.get("host") + "/users/" + this.sub;
            }
            else
            {
                this.id = null;
                this.sub = data.sub;
                this.first_name = data.firstName;
                this.last_name = data.lastName;
                this.account_created = this._dateNow();
                this.key = datastore.key('User');
                this.self = null;
            }
        }

        async insert()
        {
            // Construct the key and data for the datastore query
            var entity = {
                key: this.key,
                data: {
                    sub: this.sub,
                    first_name: this.first_name,
                    last_name: this.last_name,
                    account_created: this.account_created
                }
            }
    
            // Insert the new boat
            await datastore.insert(entity);
        }

        /**
         * Returns a user object without metadata
         */
        getUser() {
            return {
                id: this.id,
                sub: this.sub,
                first_name: this.first_name,
                last_name: this.last_name,
                account_created: this.account_created,
                self: this.self
            }
        }

        _dateNow() {
            var today = new Date();
            var dd = String(today.getDate()).padStart(2, '0');
            var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
            var yyyy = today.getFullYear();

            today = mm + '/' + dd + '/' + yyyy;
            return today;
        }
    }