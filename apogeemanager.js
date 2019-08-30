var fs = require('fs');
const { WorkspaceManager } = require('./WorkspaceManager');

class ApogeeManager {
    
    //================================
    // Public Methods
    //================================
    
    /** Constructor. Pass in the name for this handler, to be used in error messages
     * and such. It should typically be the path to this handler. 
     */
    constructor() {     
        this.descriptor = null;
        this.settings = null;
        this.handlerStubs = {};
    }
    
    /** This method initializes the handler with the descriptor json. */
    init(app,descriptor) {
        this.descriptor = descriptor; 

        //create settings instance
        this.settings = this._loadSettings(descriptor);

        //create handler stubs
        if(!descriptor.workspaces) {
            throw new Error("Workspaces entry missing in descriptor!");
        }

        for(let workspaceName in descriptor.workspaces) {
            let workspaceInfo = descriptor.workspaces[workspaceName];
            let workspaceManager = new WorkspaceManager(workspaceName,workspaceInfo,this.settings);

            //this is asynchronous. It won't handle requests until it is finished
            workspaceManager.initEndpoints(app);

            this.handlerStubs[workspaceName] = WorkspaceManager;
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
        var settings = Object.assign({},ApogeeManager.GLOBAL_SETTINGS);
        
        if(descriptor.settings) {
            settings = Object.assign(settings,descriptor.settings);
        } 
        
        return settings;
    }
    
}

/** Global settings */
ApogeeManager.GLOBAL_SETTINGS = {
    maxHandlerCount: 5,
    maxWaitLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes
    maxResponseIterations: 50 //50 distinct actions? - set to more if workspace uses a lot of these
}

/** This method returns an Apogee instance, which will be asynchronously
 * initialized when the descriptor file is loaded. */
module.exports.loadApogeeManager = function(app,descriptorFileLocation) {

    var apogeeeManager = new ApogeeManager();
    
    var onDescriptorRead = (err,descriptorText) => {
        if(err) {
            console.log("Error: Descriptor not read. " + err);
        }
        else {
            try {
                var descriptor = JSON.parse(descriptorText);
                console.log("Apogee descriptor loaded");
                apogeeeManager.init(app,descriptor);               
            }
            catch(error) {
                console.log("Error initializing endpoints");
                console.error(error.stack);
            }
        }  
    }
    
    fs.readFile(descriptorFileLocation,onDescriptorRead);
    
    return apogeeeManager;
}


