var http = require("http");
var fs = require('fs');
var utils = require('./serviceUtils');
var parser = require('url');
const { WorkspaceHandlerStub } = require('./WorkspaceHandlerStub');

//this defines some globals we will be needing
require("./debugHook");

class ApogeeHandler {
    
    //================================
    // Public Methods
    //================================
    
    constructor() {
        this.descriptor = null;
        this.settings = null;
        this.handlerStubs = null;
    }
    
    /** This method starts up the server. Just call this once! IT will load*/
    init(descriptorPath) {
        if((this.settings)||(this.handlerStubs)) {
            throw new Error("The server has already been initialized!");
        }
        if(!descriptorPath) {
            throw new Error("Descriptor must be provided!");
        }
        	
        fs.readFile(descriptorPath,(err,descriptorText) => this._onDescriptorLoad(err,descriptorText));  
    }
    
    /** This method handles requests. The pathname given here is the excluding 
     * any parent directories. */
    process(pathname,queryString,request,response) {
        if((!this.settings)||(!this.handlerStubs)) {
           utils.sendError(500,"Server not properly initialized",response);
           return;
        }
        
        var handlerStub = this.handlerStubs.find(handlerStub => handlerStub.handles(pathname));
        
        if(handlerStub) {
            handlerStub.process(pathname,queryString,request,response);
        }
        else {
            utils.sendError(403,"Workspace resource not found",response);
        }
        
    }
    
    /** This method should be called to shut down the server. */
    shutdown() {
        //this doesn't actually shutdown server right now
        this.handlerStubs.forEach(handlerStub => handlerStub.shutdown());
        this.handlerStubs = [];
    }
    
    //================================
    // Private Methods
    //================================
    
    /** This method is called when the descriptor is loaded. */
    _onDescriptorLoad(err,descriptorText) {
        if(err) {
            //here just give up...
            throw new Error(err);
        }
        
        this.descriptor = JSON.parse(descriptorText); 

        //create settings instance
        this.settings = this._loadSettings(this.descriptor);

        //create handler stubs
        this.handlerStubs = this._createHandlerStubs(this.descriptor,this.settings);
    }
    
    /** This method creates the settings as the global settings with any overrides 
     * provided by the workspace descriptor. */
    _loadSettings(descriptor) {
        var settings = Object.assign({},ApogeeHandler.GLOBAL_SETTINGS);
        
        if(descriptor.settings) {
            settings = Object.assign(settings,descriptor.settings);
        } 
        
        return settings;
    }
    
    /** This method creates the handler stubs - each will dynamically load handlers
     * for a specific workspace. */
    _createHandlerStubs(descriptor,settings) {
        var handlerStubs = [];
        
        if(!descriptor.workspaces) {
            throw new Error("Workspaces entry missing in descriptor!");
        }
        
        for(var workspacePathname in descriptor.workspaces) {
            var workspaceInfo = descriptor.workspaces[workspacePathname];
            var handlerStub = new WorkspaceHandlerStub(workspacePathname,workspaceInfo,settings);
            
            //this is asynchronous. It won't handle requests until it is finished
            handlerStub.init();
            
            handlerStubs.push(handlerStub);
        }
        
        return handlerStubs;
    }
    
}

/** Global settings */
ApogeeHandler.GLOBAL_SETTINGS = {
    maxHandlerCount: 5,
    maxWaitLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes
    maxResponseIterations: 50 //50 distinct actions? - set to more if workspace uses a lot of these
}

module.exports.ApogeeHandler = ApogeeHandler;


