var fs = require('fs');
const { ParentHandler } = require ('./ParentHandler');
const { WorkspaceHandlerStub } = require('./WorkspaceHandlerStub');

class ApogeeHandler extends ParentHandler {
    
    //================================
    // Public Methods
    //================================
    
    /** Constructor. Pass in the name for this handler, to be used in error messages
     * and such. It should typically be the path to this handler. 
     */
    constructor() {
        super();  
        
        this.descriptor = null;
        this.settings = null;
        this.setStatus(Handler.STATUS_NOT_READY);
    }
    
    /** This method initializes the handler with the descriptor json. */
    init(descriptor) {
        try {
            this.descriptor = descriptor; 

            //create settings instance
            this.settings = this._loadSettings(descriptor);

            //create handler stubs
            if(!descriptor.workspaces) {
                throw new Error("Workspaces entry missing in descriptor!");
            }

            for(var workspacePathname in descriptor.workspaces) {
                var workspaceInfo = descriptor.workspaces[workspacePathname];
                var workspaceHandlerStub = new WorkspaceHandlerStub(workspacePathname,workspaceInfo,settings);

                //this is asynchronous. It won't handle requests until it is finished
                workspaceHandlerStub.init();

                this.addChildHandler(workspacePathname,workspaceHandlerStub);
            }

            this.setStatus(Handler.STATUS_READY);
        }
        catch(error) {
            console.error(error.stack);
             this.setErrorStatus(error.message);
        }
    }
    
    /** This method should be called to shut down the server. */
    shutdown() {
        
        this.setStatus(Handler.STATUS_SHUTDOWN);
        
        //this doesn't actually shutdown server right now
        this.handlerStubs.forEach(handlerStub => handlerStub.shutdown());
        this.handlerStubs = [];
    }
    
    //================================
    // Private Methods
    //================================
   
    /** This method creates the settings as the global settings with any overrides 
     * provided by the workspace descriptor. */
    _loadSettings(descriptor) {
        var settings = Object.assign({},ApogeeHandler.GLOBAL_SETTINGS);
        
        if(descriptor.settings) {
            settings = Object.assign(settings,descriptor.settings);
        } 
        
        return settings;
    }
    
}

/** Global settings */
ApogeeHandler.GLOBAL_SETTINGS = {
    maxHandlerCount: 5,
    maxWaitLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes
    maxResponseIterations: 50 //50 distinct actions? - set to more if workspace uses a lot of these
}

/** This method returns an Apogee instance, which will be asynchronously
 * initialized when the descriptor file is loaded. */
module.exports.createInstance = function(descriptorFileLocation) {
    var instance = new ApogeeHandler();
    
    var onDescriptorRead = (err,descriptorText) => {
        if(err) {
            instance.setErrorStatus(err);
        }
        else {
            try {
                var descriptor = JSON.parse(descriptorText);
                instance.init(descriptor);
                console.log("Apogee handler instance initialized");
            }
            catch(error) {
                console.error(error.stack);
                instance.setErrorStatus(error.message);
            }
        }  
    }
    
    fs.readFile(descriptorPath,onDescriptorRead);
    
    return instance;
}


