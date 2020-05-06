const {doAction} = require('./apogeeCorelib.cjs.js');
const apogeeutil = require('./apogeeUtilLib.cjs.js');

/** This is a base class that executes a synchronous or asynchronous action on a model. */
class ActionRunner {
    constructor() {
        this.workingModel = null;
    }

    /** This method sets the initial model on which to run the action. */
    setModel(model) {
        this.workingModel = model;
    }

    /** This method returns the current model, such as after completion of the action. */
    getModel() {
        return this.workingModel;
    }

    /** This function will be called when the action and any subsequent asynchronous actions complete. */
    //onActionCompleted() {}

    /** This funtion will be called if there is an error running the action. */
    //onActionError(msg) {};

    /** This gets the model run context that should be used for the model in this action runner. */
    getModelRunContext() {
        let modelRunContext = {};
        modelRunContext.doFutureAction = (modelId,action) => this.runActionOnModel(action);
        return modelRunContext;
    }

    /** This method runs an action on the model. 
     * - action - This is the action to run
     * - invalidOk - The runner checks the status of the root folders to see if the action is complete. This
     *      flag should be set to true if it is OK that some folders have the state INVAID_VALUE. It will trigger
     *      an error if such a condition is found. Otherwise it will treat this as equivent to the state normal.
     *      We will allow for INVALID_VALUE for the initial base model, but there shold not be INVALID_VALUE after
     *      a request.
     * - errorMsgPrefext - This is used to prefix an error message detected in running the action.
     */
    runActionOnModel(action,invalidOk,errorMsgPrefix) {
        //update the working model instance to run the new command
        let mutableModel = this.workingModel.getMutableModel();
        this.workingModel = mutableModel;

        let actionResult = doAction(mutableModel,action);
        
        //handle error or success
        if(actionResult.actionDone) {
            //check if we are finished yet
            //load all root folders and check error state of each
            this._processCompletedAction(invalidOk,errorMsgPrefix);
        }
        else {
            //handle error
            this.onError(errorMsgPrefix + actionResult.errorMsg);
        }
    }

    /** This is used to determine the result of an action, whether it is a completed action,
     * an intermediate action, or an error. */
    _processCompletedAction(invalidOk,errorMsgPrefix) {
        let isPending = false;

        //cycle through all root folders
        let rootFolderIdMap = this.workingModel.getChildIdMap();
        for(let childName in rootFolderIdMap) {
            let childId = rootFolderIdMap[childName];
            let child = this.workingModel.lookupMemberById(childId);
            let childState = child.getState();
            switch(childState) {
                case apogeeutil.STATE_NORMAL:
                    //maybe finished
                    break;

                case apogeeutil.STATE_ERROR:
                    //error! (For now exit on first error detected)
                    this.onActionError(errorMsgPrefix + child.getErrorMsg());
                    return;

                case apogeeutil.STATE_INVALID:
                    if(!invalidOk) {
                        //if we should not have invalid, flag an error
                        this.onActionError(errorMsgPrefix + "Unknown error - invalid result");
                        return;
                    }
                    break;

                case apogeeutil.STATE_PENDING:
                    isPending = true;
                    break;
            }
        }

        //if we get here we are either pending or finished
        if(!isPending) {
            //we are finished
            this.onActionCompleted();
        }
    }
}

module.exports.ActionRunner = ActionRunner;