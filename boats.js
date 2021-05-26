/**
 * Author: George Kochera
 * Date: 4/30/21
 * File: boats.js
 * Description: Contains all the /boats route handlers.
 */

/*
    IMPORTS
*/
var Boat = require('./boat_class')
var datastore = require('./database');
var express = require('express')
var router = express.Router();
var h = require('./helper');
var m = require('./middleware');

/**
 * Simplifies chaining the middleware declared above.
 */
var validate = [m.clientMustAcceptJSON, m.bodyKeysToLower, m.bodyMustNotContainExtraAttributes]

/*
    ROUTES
*/

/**
 * CREATE A BOAT
 */
router.post('/', validate, async (req, res) => {

    // If the user is authenticated and has a valid JWT...
    if (req.authenticated)
    {
        // Validate the incoming body.
        if (!h.requestIsValid(req, res))
        {
            return
        }

        // Create new boat object from input data
        const newBoat = new Boat(req);

        // Verify the incoming body has a name, type and length
        if (!newBoat.hasAllFields) {
            res.status(400).json({
                Error: "The request object is missing at least one of the required attributes"
            })
            return
        }

        // See if another boat already has this name
        if (await h.existsBoatWithSameName(newBoat.name))
        {
            let error = {Error: "There is already a boat with this name."}
            res.status(403).json(error);
            return
        }

        // Insert the boat
        await newBoat.insert()

        // Get the boat back
        await newBoat.get(req);

        // Send the new boat back to the user
        res.status(201).json(newBoat.getBoat())
        return
    }

    // If the user is not authenticated and does not have a valid JWT
    res.status(401).json({Error: "You must be authenticated to perform this action."})

})

// GET A SPECIFIC BOAT

router.get('/:boat_id', async (req, res) => {
    let boat_id = req.params.boat_id;

    // See if the query included a boat ID
    if (!boat_id) 
    {
        res.status(404).json({
            Error: "No boat with this boat_id exists"
        })
    }

    // If it did...
    else 
    {
        // Create a datastore key from the boat ID and try to retrieve the key
        let boatKey = datastore.key(['Boat', datastore.int(boat_id)]);
        let [boatResult] = await datastore.get(boatKey)


        // If we get undefined back, the boat doesn't exist
        if (boatResult === undefined) {
            res.status(404).json({
                Error: "No boat with this boat_id exists"
            })
        }

        // Otherwise...
        else
        {

            // Add the id and self attributes to the object and send it back to the user
            boatResult["id"] = boatResult[datastore.KEY].id.toString()
            let self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + boatResult[datastore.KEY].id;
            boatResult["self"] = self;
            
            
            // Get the actual load for each of the stored load keys
            boatResult["loads"] = await Promise.all(boatResult.loads.map(async (load) => {
                let [loadResult] = await datastore.get(load);
                let self = req.protocol + "://" + req.get("host") +  "/loads/" + loadResult[datastore.KEY].id;
                let thisLoad = {
                    id: loadResult[datastore.KEY].id,
                    self: self

                }
                return thisLoad
            }));
            
            // Format the data correctly.
            let newBoatResult = {
                id: boatResult.id,
                name: boatResult.name,
                type: boatResult.type,
                length: boatResult.length,
                loads: boatResult.loads,
                self: boatResult.self
            }

            // Send 200 back to user
            res.status(200).json(newBoatResult);
        }

    }
});

/**
 * GET ALL BOATS
 */
router.get('/', async (req, res) => {

    // If the JWT is valid...
    if (req.authenticated)
    {
        let query = datastore.createQuery('Boat')
            .filter('owner', '=', req.sub);
        
        let [result] = await h.paginate(req, query);

        let boats = result.map(boat => {
            if (!boat.hasOwnProperty('next'))
            {
                let newBoat = new Boat(boat, req);
                return newBoat.getBoat();
            }
            return boat;
    
        })
        res.status(200).json(boats)
        return;
    }

    // If the JWT is not valid or missing..
    let query = datastore.createQuery('Boat')
        .filter('isPublic', '=', true);

    let [result] = await h.paginate(req, query);
    let boats = result.map(boat => {
        if (!boat.hasOwnProperty('next'))
        {
            let newBoat = new Boat(boat, req);
            return newBoat.getBoat();
        }
        return boat;

    })
    res.status(200).json(boats)
    return
})


/**
 * DELETE A BOAT
 */
router.delete('/:boat_id', m.clientMustAcceptJSON, async (req, res) => {
    

    if (req.authenticated)
    {
        // Get boat id from URL
        let boat_id = req.params.boat_id;

        // Get the boat from DB, generate boat key
        let boatResult = await h.getBoatFromID(boat_id);
        let boatKey = h.createBoatKey(boat_id);

        // See if the boat was valid
        if (boatResult === undefined) 
        {
            res.status(403).json({
                Error: "No boat with this boat_id exists"
            })
            return
        }

        // See if this boat is not owned by the logged in user
        if (boatResult.owner !== req.sub)
        {
            res.status(403).json({
                Error: "This boat_id exists but you are not the owner."
            })
            return
        }

        // Delete the boat
        await datastore.delete(boatKey);
        res.status(204).json();
        return
    }
    res.status(401).json({
        Error: "You must be authenticated to perform this action."
    })
    return
})

// PUT A LOAD IN A BOAT

router.put('/:boat_id/loads/:load_id', async (req, res) => {

    if (req.authenticated)
    {
        let boat_id = req.params.boat_id;
        let load_id = req.params.load_id;
    
        // Create the keys for the lookups in the database
        let boatKey = datastore.key(['Boat', datastore.int(boat_id)])
        let loadKey = datastore.key(['Load', datastore.int(load_id)])
    
        // Determine if the boat and load is valid
        let [boatResult] = await datastore.get(boatKey);
        let [loadResult] = await datastore.get(loadKey);
    
        if (boatResult === undefined && loadResult === undefined) {
            res.status(404).json({
                Error: "The specified boat and load does not exist"
            })
        } else if (boatResult === undefined) {
            res.status(404).json({
                Error: "The specified boat does not exist"
            })
        } else if (loadResult === undefined) {
            res.status(404).json({
                Error: "The specified load does not exist"
            })
        } else if (loadResult.carrier !== null) {
    
            if (loadResult.carrier.id === boatKey.id) {
                res.status(403).json({
                    Error: "The specified load has already been assigned to this boat."
                })
            } else {
                res.status(403).json({
                    Error: "The specified load has already been assigned to another boat."
                })
            }
    
        // If it is valid...
        } else {
    
            // Add the load to the boatResult
            boatResult.loads.push(loadKey)
    
            // Create a boat object and save the updated version to the database
            let boat = {
                name: boatResult.name,
                type: boatResult.type,
                length: boatResult.length,
                loads: boatResult.loads
            }
    
            let boatEntity = {
                key: boatKey,
                data: boat
            }
            await datastore.update(boatEntity);
    
            // Create the load object and save it to the database
    
            let load = {
                volume: loadResult.volume,
                carrier: boatKey,
                content: loadResult.content,
                creation_date: loadResult.creation_date
            }
            let loadEntity = {
                key: loadKey,
                data: load
            }
            await datastore.update(loadEntity)
    
            // Send back a 204 confirming the update was made
            res.status(204).json()
        }
    }
})

// REMOVE A LOAD FROM A BOAT

router.delete('/:boat_id/loads/:load_id', async (req, res) => {

    if (req.authenticated)
    {
        let boat_id = req.params.boat_id;
        let load_id = req.params.load_id;
    
        // Create the keys for the lookups in the database
        let boatKey = datastore.key(['Boat', datastore.int(boat_id)])
        let loadKey = datastore.key(['Load', datastore.int(load_id)])
    
        // Determine if the boat and load is valid
        let [boatResult] = await datastore.get(boatKey);
        let [loadResult] = await datastore.get(loadKey);
        
        
        if (boatResult === undefined && loadResult === undefined) {
            res.status(404).json({
                Error: "The specified boat and load does not exist"
            })
        } else if (boatResult === undefined) {
            res.status(404).json({
                Error: "The specified boat does not exist"
            })
        } else if (loadResult === undefined) {
            res.status(404).json({
                Error: "The specified load does not exist"
            })
        } else if (loadResult.carrier === null || !keysAreEqual(loadResult.carrier, boatKey)) {
            res.status(403).json({
                Error: "The specified load is not on this boat."
            })
    
        // If it is valid...
        } else {
    
            // Add the load to the boatResult
            boatResult.loads = boatResult.loads.filter(element => element.id !== loadKey.id)
    
            // Create a boat object and save the updated version to the database
            let boat = {
                name: boatResult.name,
                type: boatResult.type,
                length: boatResult.length,
                loads: boatResult.loads
            }
    
            let boatEntity = {
                key: boatKey,
                data: boat
            }
            await datastore.update(boatEntity);
    
            // Create the load object and save it to the database
    
            let load = {
                volume: loadResult.volume,
                carrier: null,
                content: loadResult.content,
                creation_date: loadResult.creation_date
            }
            let loadEntity = {
                key: loadKey,
                data: load
            }
            await datastore.update(loadEntity)
    
            // Send back a 204 confirming the update was made
            res.status(204).json()
        }
    }
})

/**
 * UPDATE A BOAT (PARTIAL)
 */
 router.patch('/:boat_id', validate, async (req,res) => {
    
    // Validate the incoming body.
    if (!helper.requestIsValid(req, res))
    {
        return
    }

    // Get boat id from URL
    let boat_id = req.params.boat_id;

    // Get the boat from DB, generate boat key
    let boatResult = await helper.getBoatFromID(boat_id);
    let boatKey = helper.createBoatKey(boat_id);
    
    // Return error if the boat doesn't exist
    if (boatResult === undefined)
    {   
        let error = {Error: "A boat with this boat_id was not found."};
        res.status(404).json(error);
    }

    // See if another boat already has this name
    if (await helper.existsBoatWithSameName(req.body.name, boat_id))
    {
        let error = {Error: "There is already a boat with this name."}
        res.status(403).json(error);
        return
    }

    // Create a new boat object, update the boat object with desired data, update in DB
    let boat = new Boat(boatResult.name, boatResult.type, boatResult.length);
    let body;
    let status;
    if (!boat.updateFields(req.body)) 
    {
        body = {Error: "No properties of the boat were included in the body of the request."}
        status = 400
    }
    else
    {
        await datastore.update({key: boatKey, data: boat})
        // Get the boat object from DB, add id and self, send back to user
        boatResult = await helper.getBoatFromID(boat_id);
        boatResult = helper.affixIDAndSelf(boatResult, req);
        body = boatResult;
        status = 200;
    }
    res.status(status).json(body);
})

/**
 * PARTIALLY UPDATE ALL BOATS (405 SENT)
 */
router.patch('/', (req,res) => {
    let code = 405
    let error = {Error: "You cannot update all boats."}
    res.status(code).json(error)
})

/**
 * COMPLETELY UPDATE A BOAT
 */
router.put('/:boat_id', validate, async (req,res) => {
    
    // Validate the incoming body.
    if (!helper.requestIsValid(req, res))
    {
        return
    }

    // Get boat id from URL
    let boat_id = req.params.boat_id;
    
    // Get the boat from DB, generate boat key
    let boatResult = await helper.getBoatFromID(boat_id);
    let boatKey = helper.createBoatKey(boat_id);
    
    // Return error if the boat doesn't exist
    if (boatResult === undefined)
    {   
        let error = {Error: "A boat with this boat_id was not found."};
        res.status(404).json(error);
    }

    // See if another boat already has this name
    if (await helper.existsBoatWithSameName(req.body.name, boat_id))
    {
        let error = {Error: "There is already a boat with this name."}
        res.status(403).json(error);
        return
    }

    // Create a new boat object, update the boat object with desired data, update in DB
    let boat = new Boat(boatResult.name, boatResult.type, boatResult.length)
    if (boat.updateAllFields(req.body)) 
    {
        await datastore.update({key: boatKey, data: boat});
        boatResult = await helper.getBoatFromID(boat_id);
        boatResult = helper.affixIDAndSelf(boatResult, req);
        res.setHeader('Location', boatResult.self);
        res.status(303).json()
    }
    else
    {   
        let error = {Error: "PUTs at this endpoint require that all fields are updated. Use PATCH for partial updates."}
        res.status(400).json(error)
    }
});

/**
 * COMPLETELY UPDATE ALL BOATS (405 SENT)
 */
router.put('/', (req,res) => {
    let code = 405
    let error = {Error: "You cannot update all boats."}
    res.status(code).json(error)
})


/*  
    EXPORTS
*/
module.exports = router;