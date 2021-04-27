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
     * - outputIds - This is a list of ids that should be checked to see if the calculation is complete (as opposed to 
     *      pending). If there is no specific output ids, null (or falsey) can be passed and the root folders for the workspace
     *      will be used to check for calculation completion.
     * - invalidOk - The runner checks the status of the root folders to see if the action is complete. This
     *      flag should be set to true if it is OK that some folders have the state INVAID_VALUE. It will trigger
     *      an error if such a condition is found. Otherwise it will treat this as equivent to the state normal.
     *      We will allow for INVALID_VALUE for the initial base model, but there shold not be INVALID_VALUE after
     *      a request.
     * - errorMsgPrefext - This is used to prefix an error message detected in running the action.
     */
    async runActionOnModel(action,outputIds,invalidOk,errorMsgPrefix) {
        if((this.onComplete)||(this.onError)) throw new Error("Illegal internal state - action in progress.");

        let actionPromise = new Promise( (resolve,reject) => {
            this.outputIds = outputIds;
            this.onComplete = () => {
                resolve();
                this._cleanup();
            }
            this.onError = errMsg => {
                reject(errMsg);
                this._cleanup();
            }

            this._runActionOnModelImpl(action,invalidOk,errorMsgPrefix);
        })
        
        return actionPromise;
    }

    //===========================
    // private methods
    //===========================

    /** This should be called internally after an action completes. */
    _cleanup() {
        this.outputIds = null;
        this.onComplete = null;
        this.onError = null;
    }

    _runActionOnModelImpl(action,invalidOk,errorMsgPrefix) {
        if((!this.onComplete)||(!this.onError)) throw new Error("Illegal internal state - action not initialized.");

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
            this.onError(errorMsgPrefix + actionResult.errorMsg);
        }
    }

    /** This is used to determine the result of an action, whether it is a completed action,
     * an intermediate action, or an error. */
    _processCompletedAction(invalidOk,errorMsgPrefix) {
        let isPending = false;

        //If there are output ids, determine completion based on those. Otherwise use the root folders.
        let completionCheckIds = this.outputIds ? this.outputIds : this._getRootFolderIds();

        //cycle through completion members (which we need to check to see if the calc is finished)
        completionCheckIds.forEach(memberId => {
            let child = this.workingModel.lookupMemberById(memberId);
            let childState = child.getState();
            switch(childState) {
                case apogeeutil.STATE_NORMAL:
                    //maybe finished
                    break;

                case apogeeutil.STATE_ERROR:
                    //error! 
                    let errorMsg = this._getModelErrorMessage();
                    this.onError(errorMsgPrefix + errorMsg);
                    return;

                case apogeeutil.STATE_INVALID:
                    if(!invalidOk) {
                        //if we should not have invalid, flag an error
                        this.onError(errorMsgPrefix + "Unknown error - invalid result");
                        return;
                    }
                    break;

                case apogeeutil.STATE_PENDING:
                    isPending = true;
                    break;
            }
        });

        //if we get here we are either pending or finished
        if(!isPending) {
            //we are finished
            this.onComplete();
        }
    }

    /** This method loads any errors from within the folder function. 
     * @private  */
     _getModelErrorMessage(model) {
        let memberMap = this.workingModel.getField("memberMap");
        let errorMessages = [];
        //load error messages from each non-dependency error in the folder function
        for(let id in memberMap) {
            let member = memberMap[id];
            if((member.isMember)&&(member.getState() == apogeeutil.STATE_ERROR)) {
                let error = member.getError();
                if(!error.isDependsOnError) {
                    let errorDesc = error.message ? error.message : error.toString();
                    errorMessages.push(`Member '${member.getName()}': ${errorDesc}`);
                }
            }
        }
        return errorMessages.join("; ");

    }

    _getRootFolderIds() {
        let rootFolderIds = [];
        let rootFolderIdMap = this.workingModel.getChildIdMap();
        for(let childName in rootFolderIdMap) {
            rootFolderIds.push(rootFolderIdMap[childName]);
        }
        return rootFolderIds;
    }
}

module.exports.ActionRunner = ActionRunner;