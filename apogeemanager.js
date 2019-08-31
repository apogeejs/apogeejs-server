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
    getInitPromise(app,descriptorFileLocation) {

        var initPromise = new Promise( (resolve,reject) => {
            //callback for the descriptor
            var onDescriptorRead = (err,descriptorText) => {
                if(err) {
                    let errorMsg = "Error: Descriptor not read. " + err;
                    reject(errorMsg);
                }
                else {
                    try {
                        var descriptor = JSON.parse(descriptorText);
                        console.log("Apogee descriptor loaded");
                        this._initEndpoints(app,descriptor);
                        resolve();               
                    }
                    catch(error) {
                        let errorMsg = "Error initializing endpoints";
                        console.error(error.stack);
                        reject(errorMsg);
                    }
                }  
            }
            
            //read the descriptor
            try {
                fs.readFile(descriptorFileLocation,onDescriptorRead);
            }
            catch(error) {
                let errorMsg = "Error reading descriptor";
                console.error(error.stack);
                reject(errorMsg);
            }
        });

        return initPromise;
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
   
    /** This method initialized the endpoints.  */
    _initEndpoints(app,descriptor) {
        this.descriptor = descriptor; 

        //create settings instance
        

        //create handler stubs
        if(!descriptor.workspaces) {
            throw new Error("Workspaces entry missing in descriptor!");
        }

        for(let workspaceName in descriptor.workspaces) {
            let workspaceInfo = descriptor.workspaces[workspaceName];
            let workspaceSettings = this._loadSettings(workspaceInfo);
            let workspaceManager = new WorkspaceManager(workspaceName,workspaceInfo,workspaceSettings);

            //this is asynchronous. It won't handle requests until it is finished
            workspaceManager.initEndpoints(app);

            this.handlerStubs[workspaceName] = WorkspaceManager;
        }
    }

    /** This method creates the settings as the global settings with any overrides 
     * provided by the workspace descriptor. */
    _loadSettings(workspaceInfo) {
        var settings = Object.assign({},ApogeeManager.GLOBAL_SETTINGS);
        
        if(workspaceInfo.settings) {
            settings = Object.assign(settings,workspaceInfo.settings);
        } 
        
        return settings;
    }
    
}

/** Global settings */
ApogeeManager.GLOBAL_SETTINGS = {
    maxHandlerCount: 4, 
    minHandlerCount: 1,
    handlerSuccessiveCreateDelay: 5000, //we will delay between repeated checks to make new handlers
    maxHandlerUnusedLifetimeMsec: 2*60*60*1000, //2 hours
    maxHandlerLifetimeMsec: 4*60*60*1000, //4 hours
    responseTimeoutMsec: 2*60*1000, //2 minutes NOT IMPLMENTED!
    maxResponseIterations: 50 //this is a limit on iterative calculations (apogee messenger). In some cases this may be too small.
}

/** This method returns an Apogee instance, which will be asynchronously
 * initialized when the descriptor file is loaded. */
module.exports.ApogeeManager = ApogeeManager;



