const apogeeutil = require('../apogeejs-util-lib/src/apogeejs-util-lib.js');
const apogee = require('../apogeejs-model-lib/src/apogeejs-model-lib.js');
const doAction = apogee.doAction;

/** This is a base class that executes a synchronous or asynchronous action on a model. */
class ActionRunner {
    constructor() {
        this.workingModel = null;
        this.onComplete = null;
        this.onError = null;
    }

    /** This method sets the base model as a new empty model. */
    loadNewModel() {
        this.workingModel = new apogee.Model(this.getModelRunContext());
    }

    /** This method sets the base model as a clean copy of the given model. */
    copyModel(model) {
        //Clean makes sure the model is not in the middle of a calculation
        //and cleans it up if so. This shouldn't be.
        this.workingModel = model.getCleanCopy(this.getModelRunContext());
    }

    /** This method returns the current model, such as after completion of the action. */
    getModel() {
        return this.workingModel;
    }

    /** This gets the model run context that should be used for the model in this action runner. */
    getModelRunContext() {
        let modelRunContext = {};
        modelRunContext.doAsynchActionCommand = (modelId,action) => this._runActionOnModelImpl(action,true,"Internal Command:");
        return modelRunContext;
    }

    /** This method runs an action on the model and then checks the state of the system to check for an error, pending
     * or finished calculation. The action passed in can be null, in which case it immediately checks for completion.
     * The case of no action corresponds to reading static data from the model, with no input.
     * - action - This is the action to run
     * - invalidOk - The runner checks the status of the root folders to see if the action is complete. This
     *      flag should be set to true if it is OK that some folders have the state INVAID_VALUE. It will trigger
     *      an error if such a condition is found. Otherwise it will treat this as equivent to the state normal.
     *      We will allow for INVALID_VALUE for the initial base model, but there shold not be INVALID_VALUE after
     *      a request.
     * - errorMsgPrefext - This is used to prefix an error message detected in running the action.
     */
    async runActionOnModel(action,invalidOk,errorMsgPrefix) {
        let actionPromise = new Promise( (resolve,reject) => {
            this.onComplete = () => {
                resolve();
                this.onComplete = null;
            }
            this.onError = errMsg => {
                reject(errMsg);
                this.onError = null;
            }

            this._runActionOnModelImpl(action,invalidOk,errorMsgPrefix);
        })
        
        return actionPromise;
    }

    //===========================
    // private methods
    //===========================

    _runActionOnModelImpl(action,invalidOk,errorMsgPrefix) {
        let actionResult;
        //execute the action (if applicable)
        if(action) {
            //update the working model instance to run the new command
            let mutableModel = this.workingModel.getMutableModel();
            this.workingModel = mutableModel;

            actionResult = doAction(mutableModel,action);
        }
        
        //handle error or success
        if((!action)||(actionResult.actionDone)) {
            //check if we are finished yet
            //load all root folders and check error state of each
            this._processCompletedAction(invalidOk,errorMsgPrefix);
        }
        else {
            //handle error
            if(this.onError) this.onError(errorMsgPrefix + actionResult.errorMsg);
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
                    if(this.onError) this.onError(errorMsgPrefix + child.getErrorMsg());
                    return;

                case apogeeutil.STATE_INVALID:
                    if(!invalidOk) {
                        //if we should not have invalid, flag an error
                        if(this.orError) this.onError(errorMsgPrefix + "Unknown error - invalid result");
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
            if(this.onComplete) this.onComplete();
        }
    }
}

module.exports.ActionRunner = ActionRunner;