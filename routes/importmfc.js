var http = require('http');
var url = require('url');

var importmfc = {};

importmfc.parsePictures = function(gallery, db, username, figureid)
{
    var figures = db.get('figures');
    var images = db.get('images');
    var picids = [];
    for (var i in gallery.picture) {
        var pic = gallery.picture[i];
        var src = pic.full;
        var cat = pic.category;
        var id = parseInt(pic.id);
        console.log("!      parse picture " + id + " for item " + figureid);
        if (cat.name === "Official") {
            // official picture, get it
            var genid = images.id();
            picids.push(genid);

            (function(id, genid, src) {
                var u = url.parse(src);
                http.get({
                    hostname: u.hostname,
                    port: u.port || 80,
                    path: u.path
                }, function(res) {
                    var image = '';
                    res.setEncoding('binary');
                    res.on('data', function(chunk) {
                        image += chunk;
                    });
                    res.on('end', function() {
                        // store image
                        images.insert({_id: genid, mfcid: id, data: image});
                    });
                });
            })(id, genid, src);
        }
    }

    figures.update({_id: figureid},
                   {"$push": {
                       images: {
                           "$each": picids
                       }
                   }});
};

importmfc.parseOwned = function(owned, db, username) {
    var figures = db.get('figures');
    if (!(owned.item instanceof Array))
        owned.item = [owned.item];
    for (var i in owned.item) {
        var item = owned.item[i];
        var id = parseInt(item.data.id);
        var genid = figures.id();
        console.log("!  parse item " + id);
        var name = item.data.name;
        var released = item.data.release_date;
        var price = item.data.price;
        // get the pictures

        (function(id, genid) {
            figures.insert({
                _id: genid, mfcid: id, name: name, released: released, price: price, images: [], notes: []
            }, function(err, doc) {
                if (err)
                    return;
                var gallery = function(genid, page, pages) {
                    http.get({
                        hostname: 'myfigurecollection.net',
                        port: 80,
                        path: '/api.php?mode=gallery&type=json&item=' + id + '&page=' + page
                    }, function(res) {
                        var data = "";
                        res.on('data', function(chunk) {
                            data += chunk;
                        });
                        res.on('end', function() {
                            var json = JSON.parse(data).gallery;
                            // find all the official images
                            console.log("!    parse pictures page for " + id + " page " + page + ", remaining " + pages);
                            if (json.picture) {
                                if (!(json.picture instanceof Array))
                                    json.picture = [json.picture];
                                importmfc.parsePictures(json, db, username, genid);
                            }
                            if (pages === undefined)
                                pages = parseInt(json.num_pages);
                            --pages;
                            if (pages > 0) {
                                ++page;
                                gallery(genid, page, pages);
                            }
                        });
                    });
                };
                gallery(genid, 1);
            });
        })(id, genid);
    }
};

module.exports = importmfc;
