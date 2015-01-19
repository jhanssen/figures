var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
    var session = session;
    res.render('figures', { username: session.username });
});

module.exports = router;
