var http = require("http");
var router = require("./router");

var fileHandler = require("./fileHandler");
var deployHandler = require("./deployHandler");
deployHandler.init(router);

router.addStartsWithEndpoint("/file",fileHandler.readFile);
router.addEndpoint("/deploy",deployHandler.onDeploy);

http.createServer(router.route).listen(8888);