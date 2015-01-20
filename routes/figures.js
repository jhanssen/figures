var express = require('express');
var router = express.Router();
var http = require('http');
var url = require('url');
var importmfc = require('./importmfc');

/* GET users listing. */
router.get('/', function(req, res, next) {
    var session = req.session;
    res.render('figures', { username: session.username });
});

router.get('/import', function(req, res, next) {
    var user = req.query.importuser;
    if (user) {
        // do an MFC API query for user
        var mfc = function(page, pages) {
            http.get({
                hostname: 'myfigurecollection.net',
                port: 80,
                path: '/api.php?mode=collection&type=json&username=' + user + '&status=2&page=' + page
            }, function(res) {
                var data = "";
                res.on('data', function(chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    var obj = JSON.parse(data);
                    var owned = obj.collection.owned;
                    console.log("!parse collection page " + page);
                    if (owned.item)
                        importmfc.parseOwned(owned, req.db, req.session.username);
                    if (pages === undefined)
                        pages = parseInt(owned.num_pages);
                    --pages;
                    if (pages > 0) {
                        ++page;
                        mfc(page, pages);
                    }
                });
            });
        };
        mfc(1);
    }

    res.render('importmfc', { importuser: user });
});

router.get('/list/figures', function(req, res, next) {
    var user = req.session.username;
    var search = req.query.search;
    var db = req.db;
    var figures = db.get('figures');
    var promise;
    if (search) {
        var rx = new RegExp('.*' + search + '.*', 'i');
        promise = figures.find({name: rx}, {});
    } else {
        promise = figures.find({}, {});
    }
    if (req.query.hasOwnProperty("search")) {
        promise.on('success', function(doc) {
            res.render('listfigurespartial', { figures: doc });
        });
    } else {
        promise.on('success', function(doc) {
            res.render('listfigures', { figures: doc });
        });
    }
});

router.get('/list/figure', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var figureid = figures.id(req.query.id);
    var promise = figures.find({_id: figureid}, {});
    promise.on('success', function(doc) {
        if (!doc.length) {
            res.send('No figure');
            return;
        }
        var notes = req.db.get('notes');
        var figure = doc[0];

        if (figure.notes.length) {
            var promise = notes.find({_id: {"$in": figure.notes}});
            promise.on('success', function(doc) {
                res.render('listfigure', { name: figure.name, images: figure.images || [], figure: figure._id, notes: doc });
            });
        } else {
            res.render('listfigure', { name: figure.name, images: figure.images || [], figure: figure._id, notes: [] });
        }
    });
});

router.get('/list/image', function(req, res, next) {
    var images = req.db.get('images');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var imageid = images.id(req.query.id);
    var promise = images.find({_id: imageid}, {});
    promise.on('success', function(doc) {
        console.log(typeof doc, imageid);
        if (!doc.length) {
            res.send('No data');
            return;
        }
        res.setHeader('content-type', 'image/jpeg');
        if (typeof doc[0].data === 'object' && doc[0].data.buffer)
            res.end(doc[0].data.buffer, 'binary');
        else
            res.end(doc[0].data, 'binary');
    });
});

router.get('/remove/image', function(req, res, next) {
    var images = req.db.get('images');
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id') || !req.query.hasOwnProperty('figureid')) {
        res.send('Invalid id');
        return;
    }
    var imageid = images.id(req.query.id);
    var figureid = figures.id(req.query.figureid);
    images.remove({_id: imageid});

    var promise = figures.update({_id: figureid},
                                 {"$pull": {
                                     images: imageid
                                 }});
    promise.on('complete', function() {
        res.location("/figures/list/figure?id=" + figureid);
        res.redirect("/figures/list/figure?id=" + figureid);
    });
});

router.all('/add/image', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var id = figures.id(req.query.id || req.body.id);

    var path = req.files && req.files.path;
    if (path) {
        var images = req.db.get('images');
        var imgid = images.id();
        console.log('new image', imgid);
        var promise = images.insert({_id: imgid, data: path.buffer});
        promise.on('success', function() {
            promise = figures.update({_id: id},
                                     {"$push": {
                                         images: imgid
                                     }});
            promise.on('success', function() {
                res.location("/figures/list/figure?id=" + id);
                res.redirect("/figures/list/figure?id=" + id);
            });
        });
    } else {
        res.render('addimage', { figure: id });
    }
});

router.all('/add/note', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var id = figures.id(req.query.id || req.body.id);

    var note = req.body.note;
    if (note) {
        var notes = req.db.get('notes');
        var noteid = notes.id();
        var promise = notes.insert({_id: noteid, note: note, figures: [id]});
        promise.on('success', function() {
            promise = figures.update({_id: id},
                                      {"$push": {
                                          notes: noteid
                                      }});
            promise.on('success', function() {
                res.location("/figures/list/figure?id=" + id);
                res.redirect("/figures/list/figure?id=" + id);
            });
        });
    } else {
        res.render('addnote', { figure: id });
    }
});

router.all('/add/figure', function(req, res, next) {
    var name = req.body.name;
    if (name) {
        var figures = req.db.get('figures');
        var promise = figures.insert({name: name, images: [], notes: []});
        promise.on('success', function() {
            res.location("/figures/list/figures");
            res.redirect("/figures/list/figures");
        });
    } else {
        res.render('addfigure');
    }
});

router.get('/remove/figure', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var figureid = figures.id(req.query.id);
    console.log('removing ' + figureid);
    var promise = figures.remove({_id: figureid});
    promise.on('success', function() {
        res.location("/figures/list/figures");
        res.redirect("/figures/list/figures");
    });
});

router.get('/remove/note', function(req, res, next) {
    var notes = req.db.get('notes');
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }

    var noteid = notes.id(req.query.id);
    var figureid = figures.id(req.query.figureid);

    var promise;
    if (!figureid) {
        notes.remove({_id: noteid});
        // remove the note from all figures
        promise = figures.update({}, {"$pull": { notes: noteid }});
    } else {
        promise = figures.update({_id: figureid},
                                 {"$pull": {
                                     notes: noteid
                                 }});
    }
    promise.on('complete', function() {
        if (figureid) {
            res.location("/figures/list/figure?id=" + figureid);
            res.redirect("/figures/list/figure?id=" + figureid);
        } else {
            res.location("/figures/list/notes/");
            res.redirect("/figures/list/notes/");
        }
    });
});

router.get('/list/notes', function(req, res, next) {
    var notes = req.db.get('notes');
    var promise = notes.find({},{});
    promise.on('success', function(doc) {
        // get the figures
        var allnotes = doc;
        var figures = req.db.get('figures');
        promise = figures.find({},{});
        promise.on('success', function(doc) {
            var figmap = {};
            for (var i in doc) {
                figmap[doc[i]._id] = doc[i];
            }
            res.render('listnotes', { notes: allnotes, figures: figmap });
        });
    });
});

module.exports = router;
