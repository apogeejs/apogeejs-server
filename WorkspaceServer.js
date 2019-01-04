var http = require("http");
var utils = require('./serviceUtils');
var parser = require('url');
const { WorkspaceHandlerStub } = require('./WorkspaceHandlerStub');

//this defines some globals we will be needing
require("./debugHook");

class WorkspaceServer {
    
    //================================
    // Public Methods
    //================================
    
    constructor() {
        this.descriptor = null;
        this.settings = null;
        this.handlerStubs = null;
    }
    
    /** This method starts up the server. Just call this once!*/
    startup(descriptor) {
        if((!this.settings)||(!this.handlerStubs)) {
            throw new Error("The server has already been initialized!");
        }
        if(!descriptor) {
            throw new Error("Descriptor must be provided!");
        }
        
        this.descriptor = descriptor; 
        
        //create settings instance
        this.settings = this.loadSettings(this.descriptor);
        
        //create handler stubs
        this.handlerStubs = this.createHandlerStubs(this.descriptor,this.settings);
        
        //start listener
        http.createServer((request,response) => this.request(request,response)).listen(this.settings.port);
    }
    
    /** This method handles requests. */
    request(request,response) {
        if((!this.settings)||(!this.handlerStubs)) {
           utils.sendError(500,"Server not properly initialized",response);
           return;
        }
        
        var url = parser.parse(request.url,true);
        var handlerStub = this.handlerStubs.find(handlerStub => handlerStub.handles(url.pathname));
        
        if(handlerStub) {
            handlerStub.process(url,request,response);
        }
        else {
            utils.sendError(403,"Workspace resource not found",response);
        }
        
    }
    
    /** This method should be called to shut down the server. */
    shutdown() {
        this.handlerStubs.forEach(handlerStub => handlerStub.shutdown());
        this.handlerStubs = [];
    }
    
    //================================
    // Private Methods
    //================================
    
    /** This method creates the settings as the global settings with any overrides 
     * provided by the workspace descriptor. */
    loadSettings(desctiptor) {
        var settings = Object.assign({},WorkspaceServer.GLOBAL_SETTINGS);
        
        if(descriptor.settings) {
            settings = Object.assign(settings,descriptor.settings);
        } 
        
        return settings;
    }
    
    createHandlerStubs(descriptor,settings) {
        var handlerStubs = [];
        
        if(!descriptor.workspaces) {
            throw new Error("Workspaces entry missing in descriptor!");
        }
        
        for(var workspaceKey in descriptor.workspaces) {
            var workspaceInfo = descriptor.workspaces[workspaceKey];
            handlerStub.push(new WorkspaceHandlerStub(workspaceInfo,settings));
        }
        
        return handlerStubs;
    }
    
}

/** Global settings */
WorkspaceServer.GLOBAL_SETTINGS = {
    port: 8888, //This should be overridden!
    maxHandlerCount: 5,
    maxWaitLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes
    maxResponseIterations: 50 //50 distinct actions? - set to more if workspace uses a lot of these
}

module.exports = WorkspaceServer;


