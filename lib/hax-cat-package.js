var esprima = require('esprima');

var generator = function(obj) {
	
hax = obj;

//other changes - workspace.createContextManager - replace "window" with "process"
//delete UI stuff (all but core)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

//var hax = {};

hax.ROOT_DIRECTORY = "/hax";
hax.RESOURCE_DIR = hax.ROOT_DIRECTORY + "/resources";

;
/** Namespace for the business logic for the hax model. */
hax.core = {}

///** This is a simple entry point to debug user code */
//hax.core.getObjectFunction = function(object) {
//    var objectName = object.getFullName();
//    var workspaceName = object.getWorkspace().getName();
//    
//    return hax.core.functionCode[workspaceName][objectName];
//}


;
/* 
 * This is a mixin to give event functionality.
 */
hax.core.EventManager = {};
    
/** This serves as the constructor for the child object, when extending it. */
hax.core.EventManager.init = function() {
     /** This field holds the event listeners
    * @private */
    this.listenerTable = {};
    
    /** This field holds the event handlers
    * @private */
    this.handlerTable = {};
}

/** This method adds a listener for the given event. */
hax.core.EventManager.addListener = function(eventName, callback) {
    var callbackList = this.listenerTable[eventName];
    if(!callbackList) {
        callbackList = [];
        this.listenerTable[eventName] = callbackList;
    }
    //make sure the object is not already in the list
    for(var i = 0; i < callbackList.length; i++) {
        var c = callbackList[i];
        if(c == callback) {
            return;
        }
    }
    //add to the list
    callbackList.push(callback);
}

/** This method removes a listener for the event. */
hax.core.EventManager.removeListener = function(eventName, callback) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        var index = callbackList.indexOf(callback);
        if(index >= 0) {
            callbackList.splice(index,1);
        }
    }
}

/** THis method dispatches an event. */
hax.core.EventManager.dispatchEvent = function(eventName, eventData) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        for(var i = 0; i < callbackList.length; i++) {
            var callback = callbackList[i];
            callback.call(null,eventData);
        }
    }
}


/** This method adds a handler. */
hax.core.EventManager.addHandler = function(handlerName, callback) {
    this.handlerTable[handlerName] = callback;
}

/** This method clears a handler. */
hax.core.EventManager.removeHandler = function(handlerName) {
    delete this.handlerTable[handlerName];
}

/** This method calls a handler by name and returns the result. If no 
 * handler is found an error is thrown. */
hax.core.EventManager.callHandler = function(handlerName, handlerData) {
    var callback = this.handlerTable[handlerName];
    if(callback) {
        return callback(handlerData)
    }
    else {
        throw "Handler not found: " + handlerName;
    }
}

;

    
/** This class manages context for the user code. This is used to associate names
 *from the user code with objects from the workspace. The argument passed here is
 *the object assoicatd with the context manager. */
hax.core.ContextManager = function(member) {
    this.member = member;
    this.contextList = [];
}

hax.core.ContextManager.prototype.addToContextList = function(entry) {
    this.contextList.push(entry);
}

hax.core.ContextManager.prototype.removeFromContextList = function(entry) {
    var index = this.contextList.indexOf(entry);
    if(index >= 0) {
        this.contextList.splice(index,1);
    }
}

hax.core.ContextManager.prototype.clearContextList = function() {
    this.contextList = [];
}

hax.core.ContextManager.prototype.getBaseData = function(baseName,generation) {
    return this.hierarchicalLookup("lookupData",baseName,generation);
}

hax.core.ContextManager.prototype.getImpactor = function(path,generation) {
    return this.hierarchicalLookup("lookupImpactor",path,generation);
}

//==================================
// Private Methods
//==================================

hax.core.ContextManager.prototype.hierarchicalLookup = function(lookupFunctionName,lookupKey,generation) {
    if(generation === undefined) generation = 0;

    //lookup base name in the context list
    var result = this.lookup(lookupFunctionName,lookupKey,generation);
    
    if(result !== undefined) {
        return result;
    }
    else if((this.member)&&(this.member.getOwner)) {
        var owner = this.member.getOwner();
        if(owner) {
            var ownerContextManager = owner.getContextManager();
            return ownerContextManager.hierarchicalLookup(lookupFunctionName,lookupKey,generation + 1);
        }
    }
    
    return undefined;
}

hax.core.ContextManager.prototype.lookup = function(lookupFunctionName,lookupKey,generation) {
	//cycle through the variables used
	for(var i = 0; i < this.contextList.length; i++) {
        var entry = this.contextList[i];
        if(!((entry.isLocal)&&(generation > 1))) {
            var result = this[lookupFunctionName](entry,lookupKey); 
            if(result !== undefined) {
                return result;
            }
        }
    }
    //not found
    return undefined;
}

hax.core.ContextManager.prototype.lookupData = function(entry,baseName) {   
    if(entry.parent) {
        var child = entry.parent.lookupChild(baseName);
        if(child) {
            return child.getData();
        }
        else {
            return undefined;
        }
    }
    else if(entry.data) {
        return entry.data[baseName];
    }
}

hax.core.ContextManager.prototype.lookupImpactor = function(entry,path) {
    if(entry.parent) {
        return entry.parent.lookupChildFromPath(path);
    }
    else {
        return undefined;
    }
}



;
  
hax.core.codeCompiler = {};

/** This method analyzes the code and creates the object function and dependencies. 
 * The results are loaded into the passed object processedCodeData.
 * @private */
hax.core.codeCompiler.processCode = function(codeInfo,codeLabel) {
    
    //analyze the code
    var combinedFunctionBody = hax.core.codeCompiler.createCombinedFunctionBody(
        codeInfo.argList, 
        codeInfo.functionBody, 
        codeInfo.supplementalCode, 
        codeLabel);
        
    //get the accessed variables
    //
    //parse the code and get variabls dependencies
    var analyzeOutput = hax.core.codeAnalysis.analyzeCode(combinedFunctionBody);
    
    if(analyzeOutput.success) {
        codeInfo.varInfo = analyzeOutput.varInfo;
    }
    else {
        codeInfo.errors = analyzeOutput.errors;
        return codeInfo;
    }

    //create the object function and context setter from the code text
    var generatorFunction = hax.core.codeCompiler.createObjectFunction(codeInfo.varInfo, combinedFunctionBody);
    codeInfo.generatorFunction = generatorFunction;
    
    return codeInfo;   
}


/** This method creates the user code object function body. 
 * @private */
hax.core.codeCompiler.createCombinedFunctionBody = function(argList,
        functionBody, 
        supplementalCode,
        codeLabel) {
    
    var argListString = argList.join(",");
    
    //create the code body
    var combinedFunctionBody = hax.core.util.formatString(
        hax.core.codeCompiler.OBJECT_FUNCTION_FORMAT_TEXT,
		codeLabel,
        argListString,
        functionBody,
        supplementalCode
    );
        
    return combinedFunctionBody;
}

/** This method creates the wrapped user code object function, including the context variables. 
 * @private */
hax.core.codeCompiler.createObjectFunction = function(varInfo, combinedFunctionBody) {
    
    var contextDeclarationText = "";
    var contextSetterBody = "";
    
    //set the context - here we only defined the variables that are actually used.
	for(var baseName in varInfo) {
        //ignore this variable
        if(baseName == "__dh__") continue;
        
        var baseNameInfo = varInfo[baseName];
        
        //do not add context variable for local or "returnValue", which is explicitly defined
        if((baseName === "returnValue")||(baseNameInfo.isLocal)) continue;
        
        //add a declaration
        contextDeclarationText += "var " + baseName + ";\n";
        
        //add to the context setter
        contextSetterBody += baseName + ' = contextManager.getBaseData("' + baseName + '");\n';
    }
    
    //create the generator for the object function
    var generatorBody = hax.core.util.formatString(
        hax.core.codeCompiler.GENERATOR_FUNCTION_FORMAT_TEXT,
		contextDeclarationText,
        contextSetterBody,
        combinedFunctionBody
    );
        
    var generatorFunction = new Function("__dh__",generatorBody);
    return generatorFunction;    
}


/** This is the format string to create the code body for the object function
 * Input indices:
 * 0: unique member name
 * 1: functionName
 * 2: function argument list with parentheses
 * 3: member formula text
 * 4: supplemental code text
 * 
 * @private
 */
hax.core.codeCompiler.OBJECT_FUNCTION_FORMAT_TEXT = [
"//{0}",
"",
"//supplemental code",
"{3}",
"//end supplemental code",
"",
"//member function",
"__dh__.setObjectFunction(function({1}) {",
"//overhead code",
"__dh__.initFunction();",
"",
"//user code",
"{2}",
"});",
"//end member function",
""
   ].join("\n");
   
/** This is the format string to create the code body for the object function
 * Input indices:
 * 0: context declaration text
 * 1: context setter body
 * 2: object function body
 * @private
 */
hax.core.codeCompiler.GENERATOR_FUNCTION_FORMAT_TEXT = [
"'use strict'",
"//declare context variables",
"{0}",
"",
"//context setter",
"__dh__.setContextSetter(function(contextManager) {",
"{1}",
"});",
"",
"//user code",
"{2}"
   ].join("\n");



;
/** This function parses the code and returns a table that gives the variable use
 * in the passed function. The var info table has the following content
 * - it is a map with an entry for each variable accessed. (This refers just to
 * a variable and not to field access on that variable.
 * - the key for an entry is the name of the variable
 * - for each entry there is an array of usages. Each usage as the following info:
 * -- nameUse.path: an array of names constructing the field accessed.
   -- nameUse.scope: a reference to a scope object
   -- nameUse.node: the AST node that identifies this variable
   -- nameUse.isModified: true if the variable is modified (not 100% accurate)
   -- nameUse.isLocal: true if this is a reference to a local variable
   -- nameUse.decalredScope: for local variables only, gives the scope in which the lcoal variable is declared.
 * - additionally, there is a flag indicating if all uses of a name are local variables
 * -- isLocal: true if all uses of a varaible entry are local variables
 **/ 

hax.core.codeAnalysis = {};

/** Syntax for AST, names from Esprima.
 * Each entry is a list of nodes inside a node of a given type. the list
 * contains entries with the given fields:
 * {
 *     name:[the name of the field in the node]
 *     list:[true if the field is a list of nodes]
 *     modified:[boolean indicating if the field correspondes to a modified variable
 *     declaration:[boolean indicating if the field corrsponds to a field declaration]
 * @private */
hax.core.codeAnalysis.syntax = {
    AssignmentExpression: [{name:'left',modified:true},{name:'right'}],
    ArrayExpression: [{name:'elements',list:true}],
    ArrowFunctionExpression: [{name:'params',list:true},{name:'body'},{name:'defaults',list:true}],
    BlockStatement: [{name:'body',list:true}],
    BinaryExpression: [
        {name:'left'},
        {name:'right'}
        //I'm not sure I know all of these. Some may modify the object but we will skip that check here
    ],         
    BreakStatement: [],
    CallExpression: [{name:'callee'},{name:'arguments',list:true}],
    CatchClause: [
        {name:'param',declaration:true},
        {name:'body'}
        //guards omitted - moz specific
    ],
    ConditionalExpression: [{name:'test'},{name:'alternate'},{name:'consequent'}],
    ContinueStatement: [],
    DoWhileStatement: [{name:'body'},{name:'test',list:true}],
    EmptyStatement: [],
    ExpressionStatement: [{name:'expression'}],
    ForStatement: [{name:'init'},{name:'test'},{name:'update',list:true},{name:'body'}],
    ForOfStatement: [{name:'left'},{name:'right'},{name:'body'}],
    ForInStatement: [{name:'left'},{name:'right'},{name:'body'}],
    FunctionDeclaration: [
        {name:'id',declaration:true},
        {name:'params',list:true,declaration:true},
        {name:'body'}
        //no supporting default functions values
    ],
    FunctionExpression: [
        {name:'id',declaration:true},
        {name:'params',list:true,declaration:true},
        {name:'body'}
        //no supporting default functions values
    ],
    Identifier: [], //this is handled specially
    IfStatement: [{name:'test'},{name:'consequent'},{name:'alternate'}],
    Literal: [],
    LabeledStatement: [{name:'body'}],
    LogicalExpression: [{name:'left'},{name:'right'}],
    MemberExpression: [], //this handled specially
    NewExpression: [{name:'callee'},{name:'arguments',list:true}],
    Program: [{name:'body',list:true}],
    Property: [], //this is handled specially
    ReturnStatement: [{name:'argument'}],
    SequenceExpression: [{name:'expressions',list:true}],
    ObjectExpression: [], //this is handled specially  
    SwitchCase: [{name:'test'},{name:'consequent',list:true}],
    SwitchStatement: [{name:'discriminant'},{name:'cases',list:true}],
    ThisExpression: [],
    ThrowStatement: [{name:'argument'}],
    TryStatement: [
        {name:'block',list:true},
        {name:'handler'},
        {name:'finalizer',list:true}
        //guards omitted, moz specific
    ],
    UnaryExpression: [
        {name:'argument'}
        //the delete operator modifies, but we will skip that error check here
        //"-" | "+" | "!" | "~" | "typeof" | "void" | "delete"
    ],
    UpdateExpression: [{identifierNode:'argument',modified:true}],
    VariableDeclaration: [{name:'declarations',list:true,declaration:true}],
    VariableDeclarator: [{name:'id',declaration:true},{name:'init'}],
    WhileStatement: [{name:'body'},{name:'test',list:true}],
    WithStatement: [{name:'object'},{name:'body'}],
    YieldExpression: [
        {name:'argument'}
        //moz spidermonkey specific
    ],

    //no support
    ArrayPattern: null,
    AssignmentPattern: null,
    ClassBody: null,
    ClassDeclaration: null,
    ClassExpression: null,
    DebuggerStatement: null,
    ExportAllDeclaration: null,
    ExportDefaultDeclaration: null,
    ExportNamedDeclaration: null,
    ExportSpecifier: null,
    ImportDeclaration: null,
    ImportDefaultSpecifier: null,
    ImportNamespaceSpecifier: null,
    ImportSpecifier: null,
    MetaProperty: null,
    MethodDefinition: null,
    ObjectPattern: null,
    RestElement: null,
    SpreadElement: null,
    Super: null,
    TaggedTemplateExpression: null,
    TemplateElement: null,
    TemplateLiteral: null
    
};

////////////////////////////////////////////////////////////////////////////////
/** This method returns the error list for this formula. It is only valid
 * after a failed call to analyzeCode. 
 *
 *  Error format: (some fields may not be present)
 *  {
 *      "description":String, //A human readable description of the error
 *      "lineNumber":Integer, //line of error, with line 0 being the function declaration, and line 1 being the start of the formula
 *      "index":Integer, //the character number of the error, including the function declaration:  "function() {\n" 
 *      "column":Integer, //the column of the error
 *      "stack":String, //an error stack
 *  }
 * */
////////////////////////////////////////////////////////////////////////////////

/** This method parses the code and returns a list of variabls accessed. It throws
 * an exception if there is an error parsing.
 **/
hax.core.codeAnalysis.analyzeCode = function(functionText) {

    var returnValue = {};

    //parse the code
    var ast;
    
    try {
        ast = esprima.parse(functionText, { tolerant: true, loc: true });
    
        //check for errors in parsing
        if((ast.errors)&&(ast.errors.length > 0)) {
            returnValue.success = false;
            returnValue.errors = [];
            for(var i = 0; i < ast.errors.length; i++) {
                var astError = ast.errors[i];
                var actionError = new hax.core.ActionError(astError.description,"Analyze - Code");
                actionError.setParentException(astError);
                returnValue.errors.push(actionError);
            }
        }
    }
    catch(exception) {
        var actionError = hax.core.ActionError.processException(exception,"Analyze - Code",false);
        returnValue.success = false;
        returnValue.errors = [];
        returnValue.errors.push(actionError);
        return returnValue;
    }

    //get the variable list
    var varInfo = hax.core.codeAnalysis.getVariableInfo(ast);
    
    //return the variable info
    returnValue.success = true;
    returnValue.varInfo = varInfo;
    return returnValue;
}

/** This method analyzes the AST to find the variabls accessed from the formula.
 * This is done to find the dependencies to determine the order of calculation
 * and to do some checks (not exhaustive) that the user didn't access or modify 
 * some variables that should not be accessed or modified: no access of globals,
 * no modify tables other than through the "value" variable. 
 * 
 * - The tree is composed of nodes. Each nodes has a type which correspondds to
 * a specific statement or other program syntax element. In particular, some
 * nodes correspond to variables, which we are collecting here.
 * - The variables are in two types of nodes, a simple Identifier node or a
 * MemberExpression, which is a sequence of Identifers.
 * - If the variable is a table, then this table is stored in the "depends on map"
 * - In addition to determining which variables a fucntion depends on, some modifiers
 * are also collected for how the variable is used. 
 * -- is declaration - this node should contain an identifier that is a declaration
 * of a local variable
 * -- is modified - this node should contain an identifier that is a variable that
 * is modified. (Note this is not exhaustive. Checks that are not doen here will
 * be enforced elsewhere, though it would be preferebly to get them here.
 * @private */
hax.core.codeAnalysis.getVariableInfo = function(ast) {
    
    //create the var to hold the parse data
    var processInfo = {};
    processInfo.nameTable = {};
    processInfo.scopeTable = {};
    
    //create the base scope
    var scope = hax.core.codeAnalysis.startScope(processInfo);

    //traverse the tree, recursively
    hax.core.codeAnalysis.processTreeNode(processInfo,ast,false,false);
    
    //finish the base scope
    hax.core.codeAnalysis.endScope(processInfo,scope);
    
    //finish analyzing the accessed variables
    hax.core.codeAnalysis.markLocalVariables(processInfo);
    
    //return the variable names accessed
    return processInfo.nameTable;
}
    
/** This method starts a new loca variable scope, it should be called
 * when a function starts. 
 * @private */
hax.core.codeAnalysis.startScope = function(processInfo) {
    //initailize id gerneator
    if(processInfo.scopeIdGenerator === undefined) {
        processInfo.scopeIdGenerator = 0;
    }
    
    //create scope
    var scope = {};
    scope.id = String(processInfo.scopeIdGenerator++);
    scope.parent = processInfo.currentScope;
    scope.localVariables ={};
    
    //save this as the current scope
    processInfo.scopeTable[scope.id] = scope;
    processInfo.currentScope = scope;
}

/** This method ends a local variable scope, reverting to the parent scope.
 * It should be called when a function exits. 
 * @private */
hax.core.codeAnalysis.endScope = function(processInfo) {
    var currentScope = processInfo.currentScope;
    if(!currentScope) return;
    
    //set the scope to the parent scope.
    processInfo.currentScope = currentScope.parent;
}

/** This method analyzes the AST (abstract syntax tree). 
 * @private */
hax.core.codeAnalysis.processTreeNode = function(processInfo,node,isModified,isDeclaration) {
    
    //process the node type
    if((node.type == "Identifier")||(node.type == "MemberExpression")) {
        //process a variable
        hax.core.codeAnalysis.processVariable(processInfo,node,isModified,isDeclaration);
    } 
    else if((node.type == "FunctionDeclaration")||(node.type == "FunctionExpression")) {
        //process the functoin
        hax.core.codeAnalysis.processFunction(processInfo,node);
        
    }
    else if((node.type === "NewExpression")&&(node.callee.type === "Function")) {
        //we currently do not support the function constructor
        //to add it we need to add the local variables and parse the text body
        throw hax.core.codeAnalysis.createParsingError("Function constructor not currently supported!",node.loc); 
    }
    else {
        //process some other node
        hax.core.codeAnalysis.processGenericNode(processInfo,node);
    }
}
   
/** This method process nodes that are not variabls identifiers. This traverses 
 * down the syntax tree.
 * @private */
hax.core.codeAnalysis.processGenericNode = function(processInfo,node) {
    //load the syntax node info list for this node
    var nodeInfoList = hax.core.codeAnalysis.syntax[node.type];
    
    //process this list
    if(nodeInfoList === undefined) {
        //node not found
        throw hax.core.codeAnalysis.createParsingError("Syntax Tree Node not found: " + node.type,node.loc);
    }
    else if(nodeInfoList === null) {
        //node not supported
        throw hax.core.codeAnalysis.createParsingError("Syntax node not supported: " + node.type,node.loc);
    }
    else {
        //this is a good node - process it

        //-------------------------
        // process the node list
        //-------------------------
        for(var i = 0; i < nodeInfoList.length; i++) {
            //get node info
            var nodeInfo = nodeInfoList[i];
            
            //check if this field exists in node
            var childField = node[nodeInfo.name];
            if(childField) {
                
                if(nodeInfo.list) {
                    //this is a list of child nodes
                    for(var j = 0; j < childField.length; j++) {
                        hax.core.codeAnalysis.processTreeNode(processInfo,childField[j],nodeInfo.modified,nodeInfo.declaration);
                    }
                }
                else {
                    //this is a single node
                    hax.core.codeAnalysis.processTreeNode(processInfo,childField,nodeInfo.modified,nodeInfo.declaration);
                }
            }
        }
    }
}

/** This method processes nodes that are function. For functions a new scope is created 
 * for the body of the function.
 * @private */
hax.core.codeAnalysis.processFunction = function(processInfo,node) {
    var nodeType = node.type;
    var idNode = node.id;
    var params = node.params;
    var body = node.body;
    
    //difference here between the declaration and expression
    // - in declaration the name of the function is a variable in the parent scope
    // - in expression the name is typically left of. But it can be included, in which case
    //   it is a variable only in the child (function) scope. This lets the function call
    //   itself.
    
    if((nodeType === "FunctionDeclaration")&&(idNode)) {
        //parse id node (variable name) in the parent scope
        hax.core.codeAnalysis.processTreeNode(processInfo,idNode,false,true);
    }
    
    //create a new scope for this function
    var scope = hax.core.codeAnalysis.startScope(processInfo);
    
    if((nodeType === "FunctionExpression")&&(idNode)) {
        //parse id node (variable name) in the parent scope
        hax.core.codeAnalysis.processTreeNode(processInfo,idNode,false,true);
    }
    
    //process the variable list
    for(var i = 0; i < params.length; i++) {
        hax.core.codeAnalysis.processTreeNode(processInfo,params[i],false,true);
    }
    
    //process the function body
    hax.core.codeAnalysis.processTreeNode(processInfo,body,false,false);
    
    //end the scope for this function
    hax.core.codeAnalysis.endScope(processInfo,scope);
}

/** This method processes nodes that are variables (identifiers and member expressions), adding
 * them to the list of variables which are used in tehe formula.
 * @private */
hax.core.codeAnalysis.processVariable = function(processInfo,node,isModified,isDeclaration) {
    
    //get the variable path and the base name
    var namePath = this.getVariableDotPath(processInfo,node);
    var baseName = namePath[0];
    
    //add to the name table
    var nameEntry = processInfo.nameTable[baseName];
    if(!nameEntry) {
        nameEntry = {};
        nameEntry.name = baseName;
        nameEntry.uses = [];
        
        processInfo.nameTable[baseName] = nameEntry;
    }
    
    //add a name use entry
    var nameUse = {};
    nameUse.path = namePath;
    nameUse.scope = processInfo.currentScope;
    nameUse.node = node;
    nameUse.isModified = isModified;
    
    nameEntry.uses.push(nameUse);
    
    //if this is a declaration store it as a local varaible
    if(isDeclaration) {
        //store this in the local variables for this scope
        var scopeLocalVariables = processInfo.currentScope.localVariables;
        if(!scopeLocalVariables[baseName]) {
            scopeLocalVariables[baseName] = true;
        }
        else {
            //the variable is being redeclared! that is ok.
        }
    }
}

/** This method returns the variable and its fields which are given by the node. 
 * In the case the fields are calculated, we do not attempt to return these
 * fields. We do however factor the expressions nodes into the dependencies. 
 * @private */
hax.core.codeAnalysis.getVariableDotPath = function(processInfo,node) {
    if(node.type == "Identifier") {
        //read the identifier name
        return [node.name];
    }
    else if(node.type == "MemberExpression") {
        //read the parent identifer
        var variable = this.getVariableDotPath(processInfo,node.object);
        
        if(node.computed) {
            //the property name is an expression - process the expression but don't recording the field name
            this.processTreeNode(processInfo,node.property,false,false);
        }
        else {
            //append the member expression property to it
            variable.push(node.property.name);
        }
        
        return variable;
    }
    else {
        //this shouldn't happen. If it does we didn't code the syntax tree right
        throw this.createParsingError("Unknown application error: expected a variable identifier node.",node.loc);
    }
}

/** This method annotates the variable usages that are local variables. 
 * @private */
hax.core.codeAnalysis.markLocalVariables = function(processInfo) {
    for(var key in processInfo.nameTable) {
        var nameEntry = processInfo.nameTable[key];
        var name = nameEntry.name;
        var existNonLocal = false;
        for(var i = 0; i < nameEntry.uses.length; i++) {
            var nameUse = nameEntry.uses[i];
            var scope = nameUse.scope;
            //check if this name is a local variable in this scope or a parent scope
            var varScope = null;
            for(var testScope = scope; testScope; testScope = testScope.parent) {
                if(testScope.localVariables[name]) {
                    varScope = testScope;
                    break;
                }
            }
            if(varScope) {
                //this is a local variable
                nameUse.isLocal = true;
                nameUse.declarationScope = varScope;
            }
            else {
                existNonLocal = true;
            }
        }
        //add a flag to the name enry if all uses are local
        if(!existNonLocal) {
            nameEntry.isLocal = true;
        }
    }
}


/** This method creates an error object. 
 * format:
 * {
 *     description:[string description],
 *     lineNumber:[integer line number, including function declaration line prepended to formula],
 *     column;[integer column on line number]
 * }
 * @private */
hax.core.codeAnalysis.createParsingError = function(errorMsg,location) {
    var error = hax.core.util.createError(errorMsg,false);
    if(location) {
        error.lineNumber = location.start.line;
        error.column = location.start.column;
    }
    return error;
}
;

hax.core.codeDependencies = {};

/** This method takes the varInfo table from the code analysis and returns
 * a lsit of member objects which this member depends on.
 */
hax.core.codeDependencies.getDependencyInfo = function(varInfo,contextManager) {
    var dependencyList = [];
	var objectMap = {};
	
	//cycle through the variables used
	for(var baseName in varInfo) {
			
        //for each use of this name that is not local, find the referenced object
        var nameEntry = varInfo[baseName];
        for(var i = 0; i < nameEntry.uses.length; i++) {
            var nameUse = nameEntry.uses[i];
            if(!nameUse.isLocal) {
                //look up the object
                var namePath = nameUse.path;

                //lookup this object
                var impactor = contextManager.getImpactor(namePath);
                if(impactor) {

                    //add as dependent (note this may not be a data object - check later!)
                    var fullName = impactor.getFullName();
                    if(!objectMap[fullName]) {
                        dependencyList.push(impactor);
                        objectMap[fullName] = true;
                    }
                }
            }
		}
	}
	
	return dependencyList;
};
/** This namespace contains functions to process an update to an member
 * which inherits from the FunctionBase component. */
hax.core.calculation = {};


/** This moethod should be called on an Impactor (DataHolder) or Dependent object that changes.
 * This will allow for any Dependents to be recaculated.
 * @private */
hax.core.calculation.addToRecalculateList = function(recalculateList,member) {
    //if it is in the list, return
    if(recalculateList.indexOf(member) >= 0) return;
     
    //add this member to recalculate list if it needs to be executed
    if((member.isDependent)&&(member.needsCalculating())) {
        recalculateList.push(member);
        member.prepareForCalculate();
    }
    
    //add any member that depends on this one
    if(member.isDataHolder) {
        var impactsList = member.getImpactsList();
        for(var i = 0; i < impactsList.length; i++) {
            hax.core.calculation.addToRecalculateList(recalculateList,impactsList[i]);
        }
    }
}

/** This calls execute for each member in the recalculate list. The return value
 * is false if there are any errors.
 * @private */
hax.core.calculation.callRecalculateList = function(recalculateList,actionResponse) {
    var dependent;
    var i;
    var success = true;
    for(i = 0; i < recalculateList.length; i++) {
        dependent = recalculateList[i];   
        dependent.calculate();   
        if(dependent.hasError()) {
            var actionErrors = dependent.getErrors();
            if(actionErrors) {
                for(var j = 0; j < actionErrors.length; j++) {
                    actionResponse.addError(actionErrors[j]);
                }
            }
            success = false;
        }
    }
    
    return success;
}
;
hax.core.util = {};

/** This method creates an error object, which has a "message" in the format
 *of a system error. The isFatal flag can be set to specify if this is a fatal or nonfatal
 *error. It may also be omitted. A base error may also be set. */
hax.core.util.createError = function(msg,optionalIsFatal,optionalBaseError) {
    var error = new Error(msg);
	if(optionalIsFatal !== undefined) {
		error.isFatal = optionalIsFatal;
	}
	if(optionalBaseError !== undefined) {
		error.baseError = optionalBaseError;
	}
    return error;
}


/** This method creates an integer has value for a string. */
hax.core.util.mixin = function(destObject,mixinObject) {
    for(var key in mixinObject) {
        destObject.prototype[key] = mixinObject[key];
    }
}

/** This method creates an integer has value for a string. */
hax.core.util.stringHash = function(string) {
    var HASH_SIZE = 0xffffffff;
    var hash = 0;
    var ch;
    for (var i = 0; i < string.length; i++) {
        ch = string.charCodeAt(i);
        hash = (31 * hash + ch) & HASH_SIZE;
    }
    return hash;
}

/** This method creates an integer hash value for an object. */
hax.core.util.objectHash = function(object) {
    //this is not real efficient. It should be implemented differently
    var string = JSON.stringify(object);
    return stringHash(string);
}

hax.core.util.constructors = {
    "String": ("").constructor,
    "Number": (3).constructor,
    "Boolean": (true).constructor,
    "Date": (new Date()).constructor,
    "Object": ({}).constructor,
    "Array": ([]).constructor,
    "Function": (function(){}).constructor
}

/** This method returns the object type. */
hax.core.util.getObjectType = function(object) {
    var constructor = object.constructor;
    for(var key in hax.core.util.constructors) {
        if(constructor == hax.core.util.constructors[key]) {
            return key;
        }	
    }
    //not found
    return "Unknown";
}

/** This method creates a deep copy of an object, array or value. Note that
 * undefined is not a valid value in JSON. */
hax.core.util.deepJsonCopy = function(data) {
    if(data === null) return null;
    if(data === undefined) return undefined;
    return JSON.parse(JSON.stringify(data));
}

/** This method takes a field which can be an object, 
 *array or other value. If it is an object or array it 
 *freezes that object and all of its children, recursively. */
hax.core.util.deepFreeze = function(field) {
    if((field === null)||(field === undefined)) return;
    
    var type = hax.core.util.getObjectType(field);
	var i;
	if(type == "Object") {
		Object.freeze(field);
		for(i in field) {
			hax.core.util.deepFreeze(field[i]);
		}
	}
	else if(type == "Array") {
		Object.freeze(field);
		for(i = 0; i < field.length; i++) {
			hax.core.util.deepFreeze(field[i]);
		}
	}
}

/** This method does format string functionality. Text should include
 * {i} to insert the ith string argument passed. */
hax.core.util.formatString = function(format,stringArgs) {
    var formatParams = arguments;
    return format.replace(/{(\d+)}/g, function(match,p1) {
        var index = Number(p1) + 1;
        return formatParams[index]; 
    });
};

/** This method removes all the content from a DOM element. */
hax.core.util.removeAllChildren = function(element) {
	while(element.lastChild) {
		element.removeChild(element.lastChild);
	}
}

/** This creates a new array with elements from the first that are not in the second. */
hax.core.util.getListInFirstButNotSecond = function(firstList,secondList) {
    var newList = [];
    for(var i = 0; i < firstList.length; i++) {
        var entry = firstList[i];
        if(secondList.indexOf(entry) < 0) {
            newList.push(entry);
        }
    }
    return newList;
}

/** This method reads the query string from a url */
hax.core.util.readQueryField = function(field,url) {
    var href = url ? url : window.location.href;
    var reg = new RegExp( '[?&]' + field + '=([^&#]*)', 'i' );
    var string = reg.exec(href);
    return string ? string[1] : null;
};
/** This component encapsulates the child functionality for members in the workspace,
 * allowing them to sit in a organizational hierarchy.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 *  
 * COMPONENT DEPENDENCIES:
 * 
 */
hax.core.Child = {};
    
/** This serves as the constructor for the child object, when extending it. 
 * The owner should be the parent that holds this child or the object that holds
 * the hierarchy (maybe the workspace). If the owner is not a parent, this is typically
 * a folder and it is called the root folder. */
hax.core.Child.init = function(name,generator) {
    this.name = name;
    this.generator = generator;
    this.errors = [];  
}

hax.core.Child.initOwner = function(owner) {
    this.owner = owner;
    if(owner.isParent) {
        this.owner.addChild(this);
    }
    else if(owner.isRootHolder) {
        this.owner.setRoot(this);
    }
}

hax.core.Child.move = function(newName,newOwner) {
    //remove from old owner
    if(this.owner) {
        if(this.owner.isParent) {
            this.owner.removeChild(this);
        }
        else {
            //don't allow moving a root for now!
            //or renaiming either!
        }
    }
    //change name
    this.name = newName;
    
    //place in the new owner
    this.initOwner(newOwner);
}

/** This property tells if this object is a child.
 * This property should not be implemented on non-children. */
hax.core.Child.isChild = true

/** this method gets the name. */
hax.core.Child.getName = function() {
    return this.name;
}

/** This method returns the full name in dot notation for this object. */
hax.core.Child.getFullName = function() {
    if(this.owner) {
        return this.owner.getPossesionNameBase() + this.name;
    }
    else {
        return this.name;
    }
}

/** This method returns a display name for the child object. By default it returns
/* the object name but can by overriden by the child implementation. */
hax.core.Child.getDisplayName = function() {
    return this.name;
}

/** This returns the owner for this child. */
hax.core.Child.getOwner = function() {
    return this.owner;
}

/** This returns the parent for this child. For the root folder
 * this value is null. */
hax.core.Child.getParent = function() {
    if((this.owner)&&(this.owner.isParent)) {
        return this.owner;
    }
    else {
        return null;
    }
}

/** this method gets the workspace. */
hax.core.Child.getWorkspace = function() {
   if(this.owner) {
       return this.owner.getWorkspace();
   }
   else {
       return null;
   }
}

/** this method gets the root folder/namespace for this object. */
hax.core.Child.getRoot = function() {
    var ancestor = this;
	while(ancestor) {
		var owner = ancestor.getOwner();
        if(!owner) {
            return null;
        }
        else if(!owner.isParent) {
            return ancestor;
        }
        ancestor = owner;
	} 
	return null; //this shouldn't happen
}

/** This method sets the pre calc error for this dependent. */
hax.core.Child.addError = function(error) {
    this.errors.push(error);
}

/** This method sets the pre calc error for this dependent. */
hax.core.Child.addErrors = function(errorList) {
    this.errors = this.errors.concat(errorList);
}

/** This method clears the error list. */
hax.core.Child.clearErrors = function(type) {
    var newList = [];
    if(type != null) {    
        for(var i = 0; i < this.errors.length; i++) {
            var entry = this.errors[i];
            if(entry.type != type) {
                newList.push(entry);
            }
        }
    }
    this.errors = newList;
}

/** This returns true if there is a pre calc error. */
hax.core.Child.hasError = function() {
    return (this.errors.length > 0);
}

/** This returns the pre calc error. */
hax.core.Child.getErrors = function() {
    return this.errors;
}

/** This method writes the child to a json. */
hax.core.Child.toJson = function() {
	var json = {};
    json.name = this.name;
    json.type = this.generator.type;
    if(this.addToJson) {
        this.addToJson(json);
    }
    
    if(this.getUpdateData) {
        var updateData = this.getUpdateData();
        json.updateData = updateData;
    }
    return json;
}

///** This method creates a child from a json. IT should be implemented as a static
// * function in extending objects. */ 
//hax.core.Child.fromJson = function(workspace,json,updateDataList,actionResponse) {
//}

//========================================
// "Protected" Methods
//========================================

/** This method is called when the child is deleted. If necessary the implementation
 * can extend this function, but it should call this base version of the function
 * if it does.  
 * @protected */
hax.core.Child.onDeleteChild = function() {
    if(!(this.owner)) return;
    
	if(this.owner.isParent) {
		this.owner.removeChild(this);
	}
    else if(this.owner.isRootHolder) {
        this.owner.setRoot(null);
    }
    this.owner = null;
}

//Implement this method if there is data to add to this child. Otherwise it may
//be omitted
///** This method adds any additional data to the json saved for this child. 
// * @protected */
//hax.core.Child.addToJson = function(json) {
//}

//Implement this method if there is update data for this json. otherwise it may
//be omitted
///** This gets an update structure to upsate a newly instantiated child
//* to match the current object. It may return "undefined" if there is no update
//* data needed. 
//* @protected */
//hax.core.Child.getUpdateData = function() {
//}

;
/** This component encapsulates an object that has a context manager.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 */
hax.core.ContextHolder = {};

/** This initializes the component */
hax.core.ContextHolder.init = function() {
    //will be set on demand
    this.contextManager = null;
}

hax.core.ContextHolder.isContextHolder = true;

/** This method retrieves the context manager. */
hax.core.ContextHolder.getContextManager = function() {
    if(!this.contextManager) {
        //set the context manager
        this.contextManager = this.createContextManager();
    }
    
    return this.contextManager;
}

//this method must be implemneted in extending classes
///** This method retrieve creates the loaded context manager. */
//hax.core.ContextHolder.createContextManager = function();

/** This is used only if the context manager should be replaced with an existing one.. */
hax.core.ContextHolder.setContextManager = function(contextManager) {
    this.contextManager = contextManager;
}




;
/** This component encapsulates an object that holds data. The data is the object
 * that is accessed when the user calls the child name from the code. Any object that
 * is a data holder can serve to impact a dependent.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A DataHolder must be a Child.
 */
hax.core.DataHolder = {};

/** This initializes the component */
hax.core.DataHolder.init = function() {
    this.data = null;
    
    //these are a list of members that depend on this member
    this.impactsList = [];
    
    this.dataSet = false;
}

/** This property tells if this object is a data holder.
 * This property should not be implemented on non-data holders. */
hax.core.DataHolder.isDataHolder = true;

/** This sets the value of dataSet to false. It is automatically set to true in set data. */
hax.core.DataHolder.clearDataSet = function() {
    this.dataSet = false;
}

/** This returns true if the data has been set.  This value must be managed externally. */
hax.core.DataHolder.getDataSet = function() {
    return this.dataSet;
}

/** this method gets the data map. */
hax.core.Child.getData = function() {
    return this.data;
}

/** This returns an array of members this member impacts. */
hax.core.DataHolder.getImpactsList = function() {
    return this.impactsList;
}

/** This method sets the data for this object. This is the object used by the 
 * code which is identified by this name, for example the JSON object associated
 * with a JSON table. Besides hold the data object, this updates the parent data map. */
hax.core.DataHolder.setData = function(data) {
    this.data = data;
    this.dataSet = true;
    
    var parent = this.getParent();
    if(parent) {
        parent.updateData(this);
    }
}

//===================================
// Private or Internal Functions
//===================================

/** This method adds a data member to the imapacts list for this node.
 * The return value is true if the member was added and false if it was already there. 
 * @private */
hax.core.DataHolder.addToImpactsList = function(member) {
    //exclude this member
    if(member === this) return;
    
    //add to the list iff it is not already there
    if(this.impactsList.indexOf(member) === -1) {
        this.impactsList.push(member);
        return true;
    }
    else {
        return false;
    }
}

/** This method removes a data member from the imapacts list for this node. 
 * @private */
hax.core.DataHolder.removeFromImpactsList = function(member) {
    //it should appear only once
    for(var i = 0; i < this.impactsList.length; i++) {
        if(this.impactsList[i] == member) {
            this.impactsList.splice(i,1);
            return;
        }
    }
}







;
/** This mixin encapsulates an object in the workspace that depends on another
 * object. The dependent allows for a recalculation based on an update of the 
 * objects it depends on.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Dependent must be a Child.
 * 
 */
hax.core.Dependent = {};

/** This initializes the component */
hax.core.Dependent.init = function() {
    
    //this is the list of dependencies
    this.dependsOnList = [];
    this.dependenciesSet = true;
}

/** This property tells if this object is a dependent.
 * This property should not be implemented on non-dependents. */
hax.core.Dependent.isDependent = true;

/** This returns a list of the members that this member depends on. */
hax.core.Dependent.getDependsOn = function() {
    return this.dependsOnList;
}

/** This returns false if the dependencies are (known to be) not up to date. */
hax.core.Dependent.getDependenciesSetFlag = function() {
    return this.dependenciesSet;
}

/** This sets the dependencies set flag. It is used mainly to set the flag to false when something changes extenally. */
hax.core.Dependent.setDependenciesSetFlag = function(dependenciesSet) {
    this.dependenciesSet = dependenciesSet;
}

//Must be implemented in extending object
///** This method udpates the dependencies if needed because
// *a variable was added or removed from the workspace.  */
//hax.core.Dependent.updateDependeciesForModelChange = function(object);

///** This is a check to see if the object should be checked for dependencies 
// * for recalculation. It is safe for this method to always return false and
// allow the calculation to happen. 
// * @private */
//hax.core.Dependent.needsCalculating = function();

///** This updates the member based on a change in a dependency.  */
//hax.core.Dependent.prepareForCalculate = function();

///** This updates the member based on a change in a dependency.  */
//hax.core.Dependent.calculate = function();

///** This method initializes the data for this function.  */
//hax.core.Dependent.initFunction = function();

/** This method makes sure any impactors are set. It sets a dependency 
 * error if one or more of the dependencies has a error. */
hax.core.Dependent.initializeImpactors = function() {
    var errorDependencies = [];    
    
    //make sure dependencies are up to date
    for(var i = 0; i < this.dependsOnList.length; i++) {
        var impactor = this.dependsOnList[i];
        if((impactor.needsCalculating())&&(!impactor.getDataSet())) {
            impactor.calculate();
        }
        if(impactor.hasError()) {
            errorDependencies.push(impactor);
        }                   
    }

    if(errorDependencies.length > 0) {
        this.createDependencyError(errorDependencies);
    }
}

/** This method does any needed cleanup when the dependent is depeted.. */
hax.core.Dependent.onDeleteDependent = function() {
    //remove this dependent from the impactor
    for(var i = 0; i < this.dependsOnList.length; i++) {
        var remoteMember = this.dependsOnList[i];
        //remove from imacts list
        remoteMember.removeFromImpactsList(this);
    }
}
//===================================
// Private Functions
//===================================

/** This sets the dependencies based on the code for the member. */
hax.core.Dependent.updateDependencies = function(newDependsOn) {
    
    var dependenciesUpdated = false;
    
    if(!newDependsOn) {
        newDependsOn = [];
    }
    
	//retireve the old list
    var oldDependsOn = this.dependsOnList;
	
    //create the new dependency list
	this.dependsOnList = [];
	
    //update the dependency links among the members
	var newDependencySet = {};
    var remoteMember;
    var i;
    for(i = 0; i < newDependsOn.length; i++) {
        remoteMember = newDependsOn[i];
		
		if(!remoteMember.isDataHolder) {
            //PLACE A WARNING HERE!!!
        }
		else {	
			
			this.dependsOnList.push(remoteMember);
			
			//update this member
			var isNewAddition = remoteMember.addToImpactsList(this);
            if(isNewAddition) {
                dependenciesUpdated = true;
            }

			//create a set of new member to use below
			newDependencySet[remoteMember.getFullName()] = true;
		}
    }
	
    //update for links that have gotten deleted
    for(i = 0; i < oldDependsOn.length; i++) {
        remoteMember = oldDependsOn[i];
		
		var stillDependsOn = newDependencySet[remoteMember.getFullName()];
		
		if(!stillDependsOn) {
			//remove from imacts list
			remoteMember.removeFromImpactsList(this);
            dependenciesUpdated = true;
		}
    }
    this.dependenciesSet = true;
    
    return dependenciesUpdated;
}

/** This method creates an dependency error, given a list of impactors that have an error. 
 * @private */
hax.core.Dependent.createDependencyError = function(errorDependencies) {
        //dependency error found
        var message = "Error in dependency: ";
        for(var i = 0; i < errorDependencies.length; i++) {
            if(i > 0) message += ", ";
            message += errorDependencies[i].getFullName();
        }
        var actionError = new hax.core.ActionError(message,"Calculation - Dependency",this);
        this.addError(actionError);   

}
;
/** This mixin encapsulates an object in that can be coded. It contains a function
 * and supplemental code. Object that are codeable should also be a child,
 * dependent and dataholder.
 * 
 * This is a mixin and not a class. It is used in the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Codeable must be a Child.
 * - A Codeable must be Dependent. 
 * - A Codeable must be ContextHolder
 */
hax.core.Codeable = {};

/** This initializes the component. argList is the arguments for the object function.
 * dataEvaluatesObjectFunction is used to determine if the object function for this
 * codeable can be set before the context and impactors are initialized. */
hax.core.Codeable.init = function(argList,dataEvaluatesObjectFunction) {
    
    //arguments of the member function
    this.argList = argList;
    
    //initialze the code as empty
    this.codeSet = false;
    this.functionBody = "";
    this.supplementalCode = "";
    this.varInfo = null;
    this.dependencyInfo = null;
    this.contextSetter = null;
    this.objectFunction = null;
    this.codeErrors = [];
    
    //fields used in calculation
    this.calcInProgress = false;
    this.dataSet = false;
    this.functionInitialized = false;
}

/** This property tells if this object is a codeable.
 * This property should not be implemented on non-codeables. */
hax.core.Codeable.isCodeable = true

/** This method returns the argument list.  */
hax.core.Codeable.getArgList = function() {
    return this.argList;
}

/** This method returns the fucntion body for this member.  */
hax.core.Codeable.getFunctionBody = function() {
    return this.functionBody;
}

/** This method returns the supplemental code for this member.  */
hax.core.Codeable.getSupplementalCode = function() {
    return this.supplementalCode;
}

/** This method returns the formula for this member.  */
hax.core.Codeable.setCodeInfo = function(codeInfo) {

    //set the base data
    this.argList = codeInfo.argList;
    this.functionBody = codeInfo.functionBody;
    this.supplementalCode = codeInfo.supplementalCode;

    //save the variables accessed
    this.varInfo = codeInfo.varInfo;

    if((!codeInfo.errors)||(codeInfo.errors.length === 0)) {
        //set the code  by exectuing generator
        try {
            codeInfo.generatorFunction(this);
            this.codeErrors = [];
        }
        catch(ex) {
            this.codeErrors.push(hax.core.ActionError.processException(ex,"Codeable - Set Code",false));
        }
    }
    else {
//doh - i am throwing away errors - handle this differently!
        this.codeErrors = codeInfo.errors;
    }
    
    if(this.codeErrors.length > 0) {
        //code not valid
        this.objectFunction = null;
        this.contextSetter = null;
    }
    this.codeSet = true;
    if(this.isDependent) {
        this.setDependenciesSetFlag(false);
    }
}

/** This method returns the formula for this member.  */
hax.core.Codeable.initializeDependencies = function() {
    
    if((this.hasCode())&&(this.varInfo)&&(this.codeErrors.length === 0)) {
        try {
            var newDependencyList = hax.core.codeDependencies.getDependencyInfo(this.varInfo,
                   this.getContextManager());

            //update dependencies
            this.updateDependencies(newDependencyList);
        }
        catch(ex) {
            this.codeErrors.push(hax.core.ActionError.processException(ex,"Codeable - Set Dependencies",false));
        }
    }
    else {
        //will not be calculated - has no dependencies
        this.updateDependencies([]);
    }
}

/** This method udpates the dependencies if needed because
 *the passed variable was added.  */
hax.core.Codeable.updateDependeciesForModelChange = function(recalculateList) {
    if((this.hasCode())&&(this.varInfo)) {
                  
        //calculate new dependencies
        var newDependencyList = hax.core.codeDependencies.getDependencyInfo(this.varInfo,
               this.getContextManager());
          
        //update the dependency list
        var dependenciesChanged = this.updateDependencies(newDependencyList);
        if(dependenciesChanged) {
            //add to update list
            hax.core.calculation.addToRecalculateList(recalculateList,this);
        }  
    }
}
    
/** This method returns the formula for this member.  */
hax.core.Codeable.clearCode = function() {
    this.codeSet = false;
    this.functionBody = "";
    this.supplementalCode = "";
    this.varInfo = null;
    this.dependencyInfo = null;
    this.contextSetter = null;
    this.objectFunction = null;
    this.codeErrors = [];
    
    var newDependsOn = [];
	this.updateDependencies(newDependsOn);
}

/** This method returns the formula for this member.  */
hax.core.Codeable.hasCode = function() {
    return this.codeSet;
}

/** If this is true the member is ready to be executed. 
 * @private */
hax.core.Codeable.needsCalculating = function() {
	return (this.codeSet)&&(this.getDependenciesSetFlag());
}

/** This updates the member based on a change in a dependency.  */
hax.core.Codeable.prepareForCalculate = function() {
    if(this.isDataHolder) this.clearDataSet();
    this.clearErrors();
    this.functionInitialized = false;
}

/** This method sets the data object for the member.  */
hax.core.Codeable.calculate = function() {
    
    if(((this.isDataHolder)&&(this.getDataSet()))||(this.hasError())) return;
    
    if(this.codeErrors.length > 0) {
        this.addErrors(this.codeErrors);
        return;
    }
    
    if((!this.objectFunction)||(!this.contextSetter)) {
        var msg = "Function not found for member: " + this.getName();
        var actionError = new hax.core.ActionError(msg,"Codeable - Calculate",this);
        this.addError(actionError);
        return;
    } 
    
    try {
        this.processObjectFunction(this.objectFunction);
    }
    catch(error) {
        //this is an error in the code
        if(error.stack) {
            console.error(error.stack);
        }

        var errorMsg = (error.message) ? error.message : "Unknown error";
        var actionError = new hax.core.ActionError(errorMsg,"Codeable - Calculate",this);
        actionError.setParentException(error);
        this.addError(actionError);
    }
}

/** This makes sure user code of object function is ready to execute.  */
hax.core.Codeable.initFunction = function() {
    
    if(this.functionInitialized) return;
    
    //make sure this in only called once
    if(this.calcInProgress) {
        var errorMsg = "Circular reference error";
        var actionError = new hax.core.ActionError(errorMsg,"Codeable - Calculate",this);
        this.addError(actionError);
        //clear calc in progress flag
        this.calcInProgress = false;
        return;
    }
    this.calcInProgress = true;
    
    try {
        
        //make sure the data is set in each impactor
        this.initializeImpactors();
        if(this.hasError()) {
            this.calcInProgress = false;
            return;
        }
        
        //set the context
        this.contextSetter(this.getContextManager());
    }
    catch(error) {
        //this is an error in the code
        if(error.stack) {
            console.error(error.stack);
        }
        var errorMsg = (error.message) ? error.message : "Unknown error";
        var actionError = new hax.core.ActionError(errorMsg,"Codeable - Calculate",this);
        actionError.setParentException(error);
        this.addError(actionError);
    }
    
    this.calcInProgress = false;
    this.functionInitialized = true;
}

//------------------------------
// Child Methods
//------------------------------

/** This gets an update structure to upsate a newly instantiated child
/* to match the current object. */
hax.core.Codeable.getUpdateData = function() {
    var updateData = {};
    if(this.hasCode()) {
        updateData.argList = this.getArgList();
        updateData.functionBody = this.getFunctionBody();
        updateData.supplementalCode = this.getSupplementalCode();
    }
    else {
        updateData.data = this.getData();
    }
    return updateData;
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
hax.core.Codeable.createContextManager = function() {
    return new hax.core.ContextManager(this);
}

//===================================
// Private Functions
//===================================

//implementations must implement this function
//This method takes the object function generated from code and processes it
//to set the data for the object. (protected)
//hax.core.Codeable.processObjectFunction 

/** This method sets the object function. */
hax.core.Codeable.setObjectFunction = function(objectFunction) {
    this.objectFunction = objectFunction;
}

/** This method sets the object function. */
hax.core.Codeable.setContextSetter = function(contextSetter) {
    this.contextSetter = contextSetter;
}

;
/** This component encapsulates an object that owns a child. This is different from
 * Parent in that Parent has a child within a data hierarchy. Parents are a subset of owners.
 * An object that owns a root folder if an owner but not a parent.
 * Examples of Owners that are not parent are the Workspace, which holds the workspace root folder
 * and the FolderFunction, which is a data object which has its own root folder containing its children,
 * which are inaccessible from the rest of the workspace.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * An Owner must be a Context Holder
 */
hax.core.Owner = {};

/** This initializes the component */
hax.core.Owner.init = function() {
}

hax.core.Owner.isOwner = true;

//must be implemented in extending object
///** This method retrieves the workspace for the child of this owner. */
//hax.core.Owner.getWorkspace = function();

//must be implemented in extending object
///** This method retrieves the full name whichis relevent for a root folder owned
// * by this object. */
//hax.core.Owner.getPossesionNameBase = function();

//must be implented by extending object
///** This method retrieves the context manager for this owner. */
//hax.core.Owner.getContextManager = function();


;
/** This component encapsulates an object that contains children, creating  a 
 * hierarchical structure in the workspace. Each child has a name and this name
 * forms the index of the child into its parent. (I guess that means it doesn't
 * have to be a string, in the case we made an ArrayFolder, which would index the
 * children by integer.) The Parent must also be a child.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Parent must be a Child.
 * - A Parent must be an Owner.
 */
hax.core.Parent = {};

/** This initializes the component */
hax.core.Parent.init = function() {
}

hax.core.Parent.isParent = true;


/** this is used to identify if this is the root folder. */
hax.core.Parent.isRoot = function() {
    //undefined may be OK too. If there is populated object this is not root.
    return (this.getParent() == null); 
}

///** this method gets a map of child names to children. This may not be the structure
// * of the data in the parent, but it is the prefered common representation. */
//hax.core.Parent.getChildMap = function();

// Must be implemented in extending object
///** This method looks up a child from this folder.  */
//hax.core.Folder.lookupChild = function(name);

/** This method looks up a child using an arry of names corresponding to the
 * path from this folder to the object.  Note: the method will return the 
 * fist non-folder it finds, even if the path is not completed. In this case
 * it is assumed the path refers to a field inside this object. */
hax.core.Parent.lookupChildFromPath = function(path) {
	var object = this;
	for(var i = 0; ((object)&&(i < path.length)&&(object.isParent)); i++) {
		object = object.lookupChild(path[i]);
	}
    return object;
}

// Must be implemented in extending object
///** This method adds the child to this parent. 
// * It will fail if the name already exists.  */
//hax.core.Parent.addChild = function(child);

// Must be implemented in extending object
///** This method removes this child from this parent.  */
//hax.core.Folder.removeChild = function(child);

// Must be implemented in extending object
///** This method updates the data object for this child. */
//hax.core.Folder.updateData = function(child);

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
hax.core.Parent.createContextManager = function() {
    //set the context manager
    var contextManager = new hax.core.ContextManager(this);
    //add an entry for this folder. Make it local unless this si a root folder
    var myEntry = {};
    myEntry.isLocal = !this.isRoot();
    myEntry.parent = this;
    contextManager.addToContextList(myEntry);
    
    return contextManager;
}

//------------------------------
//Owner methods
//------------------------------

/** this method gets the hame the children inherit for the full name. */
hax.core.Parent.getPossesionNameBase = function() {
    if(this.isRoot()) {
        if(this.owner) {
            return this.owner.getPossesionNameBase();
        }
        else {
            return this.getName() + ":";
        }
    }
    else {
        return this.getFullName() + ".";
    }
}

/** This method returns the full name in dot notation for this object. */
hax.core.Parent.getFullName = function() {
    if(this.isRoot()) {
        if(this.owner) {
            return this.owner.getPossesionNameBase();
        }
        else {
            return this.getName() + ":";
        }
    }
    else {
        return hax.core.Child.getFullName.call(this);
    }
}

;
/** This component encapsulates an object that contains a single child (usually a folder) which
 * is the "root" object for a hierarchy.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A RootHolder must be an Owner.
 */
hax.core.RootHolder = {};

/** This initializes the component */
hax.core.RootHolder.init = function() {
}

hax.core.RootHolder.isRootHolder = true;

// Must be implemented in extending object
///** This method sets the root object.  */
//hax.core.RootHolder.setRoot = function(child);

// Must be implemented in extending object
///** This method returns the root object.  */
//hax.core.RootHolder.getRoot = function();

;
/** This is the workspace. Typically owner should be null. */
hax.core.Workspace = function(nameOrJson,actionResponseForJson,owner) {
    //base init
    hax.core.EventManager.init.call(this);
    hax.core.ContextHolder.init.call(this);
    hax.core.Owner.init.call(this);
    hax.core.RootHolder.init.call(this);
    
    if(owner === undefined) owner = null;
    this.owner = owner;
    
    var inputArgType = hax.core.util.getObjectType(nameOrJson);
    
    if(inputArgType === "String") {
        this.name = nameOrJson;
        this.rootFolder = new hax.core.Folder(nameOrJson,this);
    }
    else {
        this.loadFromJson(nameOrJson,actionResponseForJson);
    }
}

//add components to this class
hax.core.util.mixin(hax.core.Workspace,hax.core.EventManager);
hax.core.util.mixin(hax.core.Workspace,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.Workspace,hax.core.Owner);
hax.core.util.mixin(hax.core.Workspace,hax.core.RootHolder);

/** this method gets the workspace name. */
hax.core.Workspace.prototype.getName = function() {
    return this.name;
}

/** this method gets the root package for the workspace. */
hax.core.Workspace.prototype.getRoot = function() {
    return this.rootFolder;
}

/** This method sets the root object - implemented from RootHolder.  */
hax.core.Workspace.prototype.setRoot = function(child) {
    this.rootFolder = child;
}

/** This allows for a workspace to have a parent. For a normal workspace this should be null. 
 * This is used for finding variables in scope. */
hax.core.Workspace.prototype.getOwner = function() {
    return this.owner;
}

/** This method updates the dependencies of any children in the workspace. */
hax.core.Workspace.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.rootFolder) {
        this.rootFolder.updateDependeciesForModelChange(recalculateList);
    }
}

/** This method removes any data from this workspace on closing. */
hax.core.Workspace.prototype.close = function() {
}

//------------------------------
// Owner Methods
//------------------------------

/** this method is implemented for the Owner component/mixin. */
hax.core.Workspace.prototype.getWorkspace = function() {
   return this;
}

/** this method gets the hame the children inherit for the full name. */
hax.core.Workspace.prototype.getPossesionNameBase = function() {
    return this.name + ":";
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
hax.core.Workspace.prototype.createContextManager = function() {
    //set the context manager
    var contextManager = new hax.core.ContextManager(this);
    //global variables from window object
    var globalVarEntry = {};
    globalVarEntry.isLocal = false;
    globalVarEntry.data = process;
    contextManager.addToContextList(globalVarEntry);
    
    return contextManager;
}


//==========================
//virtual workspace methods
//==========================

/** This method makes a virtual workspace that contains a copy of the give folder
 * as the root folder. Optionally the context manager may be set. */
hax.core.Workspace.createVirtualWorkpaceFromFolder = function(name,origRootFolder,ownerInWorkspace) {
	//create a workspace json from the root folder json
	var workspaceJson = {};
    workspaceJson.name = name;
    workspaceJson.fileType = hax.core.Workspace.SAVE_FILE_TYPE;
    workspaceJson.version = hax.core.Workspace.SAVE_FILE_VERSION;
    workspaceJson.data = origRootFolder.toJson();
	
    return new hax.core.Workspace(workspaceJson,null,ownerInWorkspace);
}

//============================
// Save Functions
//============================

/** This is the supported file type. */
hax.core.Workspace.SAVE_FILE_TYPE = "hax workspace";

/** This is the supported file version. */
hax.core.Workspace.SAVE_FILE_VERSION = 0.1;

hax.core.Workspace.prototype.toJson = function() {
    var json = {};
    json.name = this.name;
    json.fileType = hax.core.Workspace.SAVE_FILE_TYPE;
    json.version = hax.core.Workspace.SAVE_FILE_VERSION;
    
    //components
    json.data = this.rootFolder.toJson();
    
    return json;
}


/** This is loads data from the given json into this workspace. 
 * @private */
hax.core.Workspace.prototype.loadFromJson = function(json,actionResponse) {
    var fileType = json.fileType;
	if(fileType !== hax.core.Workspace.SAVE_FILE_TYPE) {
		throw hax.core.util.createError("Bad file format.",false);
	}
    if(json.version !== hax.core.Workspace.SAVE_FILE_VERSION) {
        throw hax.core.util.createError("Incorrect file version.",false);
    }
    
    this.name = json.name;
	
	//load context links
	if(json.contextManager) {
		//for now just include this one. Later we need to have some options
		//for saving and opening
		//THIS IS ONLY FOR THE WORKSHEET IMPLEMENTATION FOR NOW!
		this.setContextManager(json.contextManager);
	}
	
	//recreate the root folder and its children
    //this.rootFolder = hax.core.createmember.createMember(this,json.data,actionResponse);
    //DOH! This currently doesn't because create member assumes the root folder is set. 
    //maybe we should update so setting the owner on the root folder sets the root folder,
    //such as if the alternative to a parent is a "rootholder" or something like that.
    //for now I will jsut copy everything in create member
    
    if(!actionResponse) actionResponse = new hax.core.ActionResponse();

    hax.core.createmember.createMember(this,json.data,actionResponse);
    
    return actionResponse;
}

//================================
// Member generator functions
//================================

hax.core.Workspace.memberGenerators = {};

/** This methods retrieves the member generator for the given type. */
hax.core.Workspace.getMemberGenerator = function(type) {
    return hax.core.Workspace.memberGenerators[type];
}

/** This method registers the member generator for a given named type. */
hax.core.Workspace.addMemberGenerator = function(generator) {
    hax.core.Workspace.memberGenerators[generator.type] = generator;
};
/** This class encapsulatees a data table for a JSON object */
hax.core.JsonTable = function(name,owner,initialData) {
    //base init
    hax.core.Child.init.call(this,name,hax.core.JsonTable.generator);
    hax.core.DataHolder.init.call(this);
    hax.core.Dependent.init.call(this);
    hax.core.ContextHolder.init.call(this);
	hax.core.Codeable.init.call(this,[],true);
    
    this.initOwner(owner);
    
    //set initial data
    if(!initialData) {
        //default initail value
        initialData = {};
        initialData.data = "";
    }  
    hax.core.updatemember.applyCodeOrData(this,initialData);
}

//add components to this class
hax.core.util.mixin(hax.core.JsonTable,hax.core.Child);
hax.core.util.mixin(hax.core.JsonTable,hax.core.DataHolder);
hax.core.util.mixin(hax.core.JsonTable,hax.core.Dependent);
hax.core.util.mixin(hax.core.JsonTable,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.JsonTable,hax.core.Codeable);

//------------------------------
// DataHolder Methods
//------------------------------

/** This method extends set data from DataHOlder. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
hax.core.JsonTable.prototype.setData = function(data) {
    
	//make this object immutable
	hax.core.util.deepFreeze(data);

	//store the new object
    return hax.core.DataHolder.setData.call(this,data);
}

//------------------------------
// Codeable Methods
//------------------------------
	
hax.core.JsonTable.prototype.processObjectFunction = function(objectFunction) {	
    //tjhe data is the output of the function
    var data = objectFunction();
	this.setData(data);
}

//------------------------------
// Child Methods
//------------------------------

/** This method creates a child from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
hax.core.JsonTable.fromJson = function(owner,json,actionResponse) {
    return new hax.core.JsonTable(json.name,owner,json.updateData);
}

//============================
// Static methods
//============================

hax.core.JsonTable.generator = {};
hax.core.JsonTable.generator.displayName = "Table";
hax.core.JsonTable.generator.type = "hax.core.JsonTable";
hax.core.JsonTable.generator.createMember = hax.core.JsonTable.fromJson;

//register this member
hax.core.Workspace.addMemberGenerator(hax.core.JsonTable.generator);;
/** This is a function. */
hax.core.FunctionTable = function(name,owner,initialData) {
    //base init
    hax.core.Child.init.call(this,name,hax.core.FunctionTable.generator);
    hax.core.DataHolder.init.call(this);
    hax.core.Dependent.init.call(this);
    hax.core.ContextHolder.init.call(this);
	hax.core.Codeable.init.call(this,argList,false);
    
    this.initOwner(owner);
    
    //set initial data
    var argList = initialData.argList ? initialData.argList : [];
    var functionBody = initialData.functionBody ? initialData.functionBody : "";
    var supplementalCode = initialData.supplementalCode ? initialData.supplementalCode : "";
    hax.core.updatemember.applyCode(this,argList,functionBody,supplementalCode);
}

//add components to this class
hax.core.util.mixin(hax.core.FunctionTable,hax.core.Child);
hax.core.util.mixin(hax.core.FunctionTable,hax.core.DataHolder);
hax.core.util.mixin(hax.core.FunctionTable,hax.core.Dependent);
hax.core.util.mixin(hax.core.FunctionTable,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.FunctionTable,hax.core.Codeable);

//------------------------------
// Codeable Methods
//------------------------------

hax.core.FunctionTable.prototype.processObjectFunction = function(objectFunction) {	
    //tjhe data is the function
	this.setData(objectFunction);
}

//------------------------------
// Child Methods
//------------------------------

/** This overrides the get title method of child to return the function declaration. */
hax.core.FunctionTable.prototype.getDisplayName = function() {
    var name = this.getName();
    var argList = this.getArgList();
    var argListString = argList.join(",");
    return name + "(" + argListString + ")";
}

/** This method creates a child from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
hax.core.FunctionTable.fromJson = function(owner,json,actionResponse) {
    return new hax.core.FunctionTable(json.name,owner,json.updateData);
}

//============================
// Static methods
//============================

hax.core.FunctionTable.generator = {};
hax.core.FunctionTable.generator.displayName = "Function";
hax.core.FunctionTable.generator.type = "hax.core.FunctionTable";
hax.core.FunctionTable.generator.createMember = hax.core.FunctionTable.fromJson;

//register this member
hax.core.Workspace.addMemberGenerator(hax.core.FunctionTable.generator);;
/** This class encapsulatees a member used to IO. t does not hold data in the model. */
hax.core.Control = function(name,owner,initialData) {
    //base init
    hax.core.Child.init.call(this,name,hax.core.Control.generator);
    hax.core.Dependent.init.call(this);
    hax.core.ContextHolder.init.call(this);
	hax.core.Codeable.init.call(this,["resource"],true);
    
    this.initOwner(owner);
    
    this.resource = null;
    
    if(!initialData) initialData = {};
    var argList = initialData.argList ? initialData.argList : ["resource"];
    var functionBody = initialData.functionBody ? initialData.functionBody : "";
    var supplementalCode = initialData.supplementalCode ? initialData.supplementalCode : "";
    hax.core.updatemember.applyCode(this,argList,functionBody,supplementalCode);
}

//add components to this class
hax.core.util.mixin(hax.core.Control,hax.core.Child);
hax.core.util.mixin(hax.core.Control,hax.core.Dependent);
hax.core.util.mixin(hax.core.Control,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.Control,hax.core.Codeable);
	
hax.core.Control.prototype.getResource = function() {	
    return this.resource;
}    

/** This method updates the resource for this resource. */
hax.core.Control.prototype.updateResource = function(resource) {	
    this.resource = resource;
	
    //re-execute, if needed
	if(this.needsCalculating()) {
        this.calculate();
    }
} 

//------------------------------
// Codeable Methods
//------------------------------

hax.core.Control.prototype.processObjectFunction = function(objectFunction) {	
    //exectue the object function passing the resource object.
    if(this.resource) {
        objectFunction(this.resource);
    }
}

//------------------------------
// Child Methods
//------------------------------

/** This method creates a child from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
hax.core.Control.fromJson = function(owner,json,actionResponse) {   
    return new hax.core.Control(json.name,owner,json.updateData);
}

//============================
// Static methods
//============================

hax.core.Control.generator = {};
hax.core.Control.generator.displayName = "Control";
hax.core.Control.generator.type = "hax.core.Control";
hax.core.Control.generator.createMember = hax.core.Control.fromJson;

//register this member
hax.core.Workspace.addMemberGenerator(hax.core.Control.generator);





;
/** This is a folder. */
hax.core.Folder = function(name,owner) {
    //base init
    hax.core.Child.init.call(this,name,hax.core.Folder.generator);
    hax.core.DataHolder.init.call(this);
    hax.core.Dependent.init.call(this);
    hax.core.ContextHolder.init.call(this);
    hax.core.Owner.init.call(this);
    hax.core.Parent.init.call(this);
    
    this.initOwner(owner);

    //this holds the base objects, mapped by name
    this.childMap = {};
    this.dataMap = {};
	
	//make sure the data map is frozen
	Object.freeze(this.dataMap);
    this.setData(this.dataMap);
}

//add components to this class
hax.core.util.mixin(hax.core.Folder,hax.core.Child);
hax.core.util.mixin(hax.core.Folder,hax.core.DataHolder);
hax.core.util.mixin(hax.core.Folder,hax.core.Dependent);                      
hax.core.util.mixin(hax.core.Folder,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.Folder,hax.core.Owner);
hax.core.util.mixin(hax.core.Folder,hax.core.Parent);

//------------------------------
// Parent Methods
//------------------------------

/** this method gets the table map. */
hax.core.Folder.prototype.getChildMap = function() {
    return this.childMap;
}

/** This method looks up a child from this folder.  */
hax.core.Folder.prototype.lookupChild = function(name) {
    //check look for object in this folder
    return this.childMap[name];
}

/** This method adds a table to the folder. It also sets the folder for the
 *table object to this folder. It will fail if the name already exists.  */
hax.core.Folder.prototype.addChild = function(child) {
	
    //check if it exists first
    var name = child.getName();
    if(this.childMap[name]) {
        //already exists! not fatal since it is not added to the model yet,
        throw hax.core.util.createError("There is already an object with the given name.",false);
    }
    //add object
    this.childMap[name] = child;
    if(child.isDataHolder) {
		var data = child.getData();
		//object may first appear with no data
		if(data !== undefined) {
			this.spliceDataMap(name,data);
		}
    }
    
    //set all children as dependents
    this.calculateDependents();
}

/** This method removes a table from the folder. */
hax.core.Folder.prototype.removeChild = function(child) {
    //make sure this is a child of this object
	var parent = child.getParent();
    if((!parent)||(parent !== this)) return;
	
    //remove from folder
    var name = child.getName();
    delete(this.childMap[name]);
	if(child.isDataHolder) {
		this.spliceDataMap(name);
	}
    
    //set all children as dependents
    this.calculateDependents();
}

/** This method updates the table data object in the folder data map. */
hax.core.Folder.prototype.updateData = function(child) {
	if(!child.isDataHolder) return;
	
    var name = child.getName();
    var data = child.getData();
    if(this.childMap[name] === undefined) {
        alert("Error - this table " + name + " has not yet been added to the folder.");
        return;
    }
	this.spliceDataMap(name,data);
}

/** There is no calculation for the folder base on dependents. 
 * @private */
hax.core.Folder.prototype.needsCalculating = function() {
    return false;
}

/** There is no calculation in the folder.  */
hax.core.Folder.prototype.calculate = function() {
    
}

//------------------------------
// Dependent Methods
//------------------------------

/** This method updates the dependencies of any children
 * based on an object being added. */
hax.core.Folder.prototype.updateDependeciesForModelChange = function(recalculateList) {
    for(var key in this.childMap) {
        var child = this.childMap[key];
        if(child.isDependent) {
            child.updateDependeciesForModelChange(recalculateList);
        }
    }
}

//------------------------------
// Child Methods
//------------------------------

/** This method creates a child from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
hax.core.Folder.fromJson = function(owner,json,childrenJsonOutputList) {
    var folder = new hax.core.Folder(json.name,owner);
    
    for(var key in json.children) {
        var childJson = json.children[key];
        childrenJsonOutputList.push(childJson);
    }
    
    return folder;
}

/** This method adds any additional data to the json to save for this child. 
 * @protected */
hax.core.Folder.prototype.addToJson = function(json) {
	json.children = {};
    
    for(var key in this.childMap) {
        var child = this.childMap[key];
        json.children[key] = child.toJson();
    }
}

//============================
// Private methods
//============================

/** This method updates the table data object in the folder data map. 
 * @private */
hax.core.Folder.prototype.calculateDependents = function() {
    var newDependsOn = [];
    for(var name in this.childMap) {
        var object = this.childMap[name];
        if(object.isDataHolder) {
            newDependsOn.push(object);
        }
    }
    this.updateDependencies(newDependsOn);
}

/** This method creates a new immutable data map, either adding a give name and data or
 * removing a name. To remove a name from the map, leave "addData" as undefined. 
 * @private */
hax.core.Folder.prototype.spliceDataMap = function(addOrRemoveName,addData) {
	var newDataMap = {};
	
	//copy old data
	for(var key in this.dataMap) {
		if(key !== addOrRemoveName) {
			newDataMap[key] = this.dataMap[key];
		}
	}
	//add or update thiis child data
	if(addData !== undefined) {
		newDataMap[addOrRemoveName] = addData;
	}
	
	//make this immutable and set it as data for this folder
	Object.freeze(newDataMap);
	this.dataMap = newDataMap;
	this.setData(this.dataMap);
}

//============================
// Static methods
//============================

hax.core.Folder.generator = {};
hax.core.Folder.generator.displayName = "Folder";
hax.core.Folder.generator.type = "hax.core.Folder";
hax.core.Folder.generator.createMember = hax.core.Folder.fromJson;

//register this member
hax.core.Workspace.addMemberGenerator(hax.core.Folder.generator);;
/** This is a folderFunction, which is basically a function
 * that is expanded into data objects. */
hax.core.FolderFunction = function(name,owner,initialData,createEmptyInternalFolder) {
    //base init
    hax.core.Child.init.call(this,name,hax.core.FolderFunction.generator);
    hax.core.DataHolder.init.call(this);
    hax.core.Dependent.init.call(this);
    hax.core.ContextHolder.init.call(this);
    hax.core.Owner.init.call(this);
    hax.core.RootHolder.init.call(this);
    
    this.initOwner(owner);
    
    //set initial data
    this.argList = initialData.argList !== undefined ? initialData.argList : "";
    this.returnValueString = initialData.returnValue !== undefined ? initialData.returnValue : [];
    //set to an empty function
    this.setData(function(){});
    
    //recreate the root folder if info is specified
    if(createEmptyInternalFolder) {
        var internalFolder = new hax.core.Folder(name,this);
        this.setRoot(internalFolder);
    }
}

//add components to this class
hax.core.util.mixin(hax.core.FolderFunction,hax.core.Child);
hax.core.util.mixin(hax.core.FolderFunction,hax.core.DataHolder);
hax.core.util.mixin(hax.core.FolderFunction,hax.core.Dependent);
hax.core.util.mixin(hax.core.FolderFunction,hax.core.ContextHolder);
hax.core.util.mixin(hax.core.FolderFunction,hax.core.Owner);
hax.core.util.mixin(hax.core.FolderFunction,hax.core.RootHolder);

/** This gets the internal forlder for the folderFunction. */
hax.core.FolderFunction.prototype.getInternalFolder = function() {
    return this.internalFolder;
}

/** Implemnetation of get root for folder function. */
hax.core.FolderFunction.prototype.getRoot = function() {
    return this.getInternalFolder();
}

/** This method sets the root object - implemented from RootHolder.  */
hax.core.FolderFunction.prototype.setRoot = function(child) {
    this.internalFolder = child;
    var newDependsOn = [child];
    this.updateDependencies(newDependsOn);
}

/** This gets the name of the return object for the folderFunction function. */
hax.core.FolderFunction.prototype.getReturnValueString = function() {
    return this.returnValueString;
}

/** This gets the arg list of the folderFunction function. */
hax.core.FolderFunction.prototype.getArgList = function() {
    return this.argList;
}

//------------------------------
// Child Methods
//------------------------------

/** This overrides the get displaymethod of child to return the function declaration. */
hax.core.FolderFunction.prototype.getDisplayName = function() {
    var name = this.getName();
    var argList = this.getArgList();
    var argListString = argList.join(",");
    
    var displayName = name + "(" + argListString + ")";
    if((this.returnValueString != null)&&(this.returnValueString.length > 0)) {
        displayName += " = " + this.returnValueString;
    }
    
    return displayName;
}

/** This method is called when the child is deleted. If necessary the implementation
 * can extend this function, but it should call this base version of the function
 * if it does.  */
hax.core.FolderFunction.prototype.onDelete = function() {
    
    var returnValue;
    
    if(this.internalFolder) {
        var actionResponse = hax.core.deletemember.deleteMember(this.internalFolder);
        if(!actionResponse.getSuccess()) {
            //show an error message
            var msg = actionResponse.getErrorMsg();
            alert(msg);
        }
    }
    
//I don't know what to do if this fails. Figure that out.
    
    //call the base delete
    returnValue = hax.core.Child.onDelete.call(this);
	return returnValue;
}

/** This method creates a child from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
hax.core.FolderFunction.fromJson = function(owner,json,childrenJsonOutputList) {
    var initialData = {};
    initialData.argList = json.argList;
    initialData.returnValue = json.returnValue;
    
    var createEmptyInternalFolder;
    if(json.internalFolder) {
        childrenJsonOutputList.push(json.internalFolder);
        createEmptyInternalFolder = false;
    }
    else {
        createEmptyInternalFolder = true;
    }

    
    return new hax.core.FolderFunction(json.name,owner,initialData,createEmptyInternalFolder);
}

/** This method adds any additional data to the json saved for this child. 
 * @protected */
hax.core.FolderFunction.prototype.addToJson = function(json) {
    json.argList = this.argList;
    json.returnValue = this.returnValueString;
    json.internalFolder = this.internalFolder.toJson();
}

//-------------------------------
// Dependent Methods
//-------------------------------
    

/** If this is true the member must be executed. */
hax.core.FolderFunction.prototype.needsCalculating = function() {
	return true;
}

/** This updates the member based on a change in a dependency.  */
hax.core.FolderFunction.prototype.prepareForCalculate = function() {
    this.clearDataSet();
}

//add these fields to object
//this.impactorDataSet = true;

/** This updates the member data based on the function. It returns
 * true for success and false if there is an error.  */
hax.core.FolderFunction.prototype.calculate = function() {
    
    var folderFunctionErrors = [];
    
	//check for code errors, if so set a data error
    var folderFunctionFunction = this.getFolderFunctionFunction(folderFunctionErrors);
    
    if(folderFunctionErrors.length == 0) {
        this.setData(folderFunctionFunction);
    }
    else {
        //for now I can only set a single error. I will set the first.
        //I should get way to set multiple
        this.addErrors(folderFunctionErrors);
    }
    
    //make sure the data is set in each impactor
    this.initializeImpactors();
}

/** This method updates the dependencies of any children
 * based on an object being added. */
hax.core.FolderFunction.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.internalFolder) {
        this.internalFolder.updateDependeciesForModelChange(recalculateList);
    }
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
hax.core.FolderFunction.prototype.createContextManager = function() {
    return new hax.core.ContextManager(this);
}

//------------------------------
//Owner methods
//------------------------------

/** this method gets the hame the children inherit for the full name. */
hax.core.FolderFunction.prototype.getPossesionNameBase = function() {
    return this.getFullName() + ":";
}


//==============================
// Private Methods
//==============================

/** This is called from the update action. It should not be called externally. */
hax.core.FolderFunction.prototype.setReturnValueString = function(returnValueString) {
    this.returnValueString = returnValueString;
}

/** This is called from the update action. It should not be called externally. */
hax.core.FolderFunction.prototype.setArgList = function(argList) {
    this.argList = argList;
}

/** This method creates the folderFunction function. It is called from the update action 
 * and should not be called externally. 
 * @private */
hax.core.FolderFunction.prototype.getFolderFunctionFunction = function(folderFunctionErrors) {

    //create a copy of the workspace to do the function calculation - we don't update the UI display version
    var virtualWorkspace;
    var rootFolder;
    var inputElementArray;
    var returnValueTable; 
    
    var initialized = false;
    var instance = this;
    
    var folderFunctionFunction = function(args) {
        
        if(!initialized) {
            //create a copy of the workspace to do the function calculation - we don't update the UI display version
            virtualWorkspace = instance.createVirtualWorkspace(folderFunctionErrors);
	
    //HANDLE THIS ERROR CASE DIFFERENTLY!!!
            if(!virtualWorkspace) {
                return null;
            }

            //lookup elements from virtual workspace
            rootFolder = virtualWorkspace.getRoot();
            inputElementArray = instance.loadInputElements(rootFolder,folderFunctionErrors);
            returnValueTable = instance.loadOutputElement(rootFolder,folderFunctionErrors);     
        }
        
        //create an update array to set the table values to the elements
        var updateDataList = [];
        for(var i = 0; i < inputElementArray.length; i++) {
            var entry = {};
            entry.member = inputElementArray[i];
            entry.data = arguments[i];
            updateDataList.push(entry);
        }

        //apply the update
        var actionResponse = hax.core.updatemember.updateObjects(updateDataList);        
        if(actionResponse.getSuccess()) {
            //retrieve the result
            if(returnValueTable) {
                return returnValueTable.getData();
            }
            else {
                //no return value found
                return undefined;
            }
        }
        else {
            //error exectuing folderFunction function - thro wan exception
            throw hax.core.util.createError(actionResponse.getErrorMsg());
        }
    }
    
    return folderFunctionFunction;    
}

/** This method creates a copy of the workspace to be used for the function evvaluation. 
 * @private */
hax.core.FolderFunction.prototype.createVirtualWorkspace = function(folderFunctionErrors) {
    try {
		return hax.core.Workspace.createVirtualWorkpaceFromFolder("temp",this.internalFolder,this.getOwner());
	}
	catch(error) {
        var actionError = hax.core.ActionError.processException(exception,"FolderFunction - Code",false);
		folderFunctionErrors.push(actionError);
		return null;
	}
}

/** This method loads the input argument members from the virtual workspace. 
 * @private */
hax.core.FolderFunction.prototype.loadInputElements = function(rootFolder,folderFunctionErrors) {
    var argMembers = [];
    for(var i = 0; i < this.argList.length; i++) {
        var argName = this.argList[i];
        var argMember = rootFolder.lookupChild(argName);
        if(argMember) {
			argMembers.push(argMember);
		}
//		else {
//            //missing input element
//            var msg = "Input element not found in folderFunction: " + argName;
//            var actionError = new hax.core.ActionError(msg,"FolderFunction - Code",this);
//            folderFunctionErrors.push(actionError);
//        }       
    }
    return argMembers;
}

/** This method loads the output member from the virtual workspace. 
 * @private  */
hax.core.FolderFunction.prototype.loadOutputElement = function(rootFolder,folderFunctionErrors) {
    var returnValueMember = rootFolder.lookupChild(this.returnValueString);
//    if(!returnValueMember) {
//        //missing input element
//        var msg = "Return element not found in folderFunction: " + this.returnValueString;
//        var actionError = new hax.core.ActionError(msg,"FolderFunction - Code",this);
//        folderFunctionErrors.push(actionError);
//    }
    return returnValueMember;
}

        
//============================
// Static methods
//============================

hax.core.FolderFunction.generator = {};
hax.core.FolderFunction.generator.displayName = "Folder Function";
hax.core.FolderFunction.generator.type = "hax.core.FolderFunction";
hax.core.FolderFunction.generator.createMember = hax.core.FolderFunction.fromJson;

//register this member
hax.core.Workspace.addMemberGenerator(hax.core.FolderFunction.generator);;
hax.core.action = {};

/** This class encapsulates a response to an action. It include a success flag,
 * a list of ActionErrors, and a fatal flag. Success is set to true unless there
 * are errors set. The fatal flag indicates that one of the errors was a fatal error.
 * When processing an action, only model data errors should be set. A code error 
 * will be translated to a data error when recalculate is called. Application 
 * errors can also be set. */
hax.core.ActionResponse = function() {
    this.success = true;
    this.errors = [];
    this.fatal = false;
}

/** This method adds an error to the error list for this action. It also sets 
 * success to false. */
hax.core.ActionResponse.prototype.addError = function(actionError) {
    this.success = false;
    if(actionError.getIsFatal()) {
        this.fatal = true;
    }
    
    if(this.errors.indexOf(actionError) < 0) {
        this.errors.push(actionError);
    }
}

/** This method returns false if there were any errors during this action. */
hax.core.ActionResponse.prototype.getSuccess = function() {
    return this.success;
}

/** This method returns the error message for this action. It is only valid if success = false. */
hax.core.ActionResponse.prototype.getErrorMsg = function() {
    var msg = "";
    if(this.fatal) {
        msg += "Unknown Error: The application is in an indeterminant state. It is recommended it be closed.\n";
    }
    for(var i = 0; i < this.errors.length; i++) {
        var actionError = this.errors[i];
        var line = "";
        if(actionError.member) {
            line += actionError.member.getName() + ": ";
        }
        line += actionError.msg;
        msg += line + "\n";
    }
    return msg;
}
        




;


/** This method class is an action error object, to be used in an action return value. 
 * The error type is a classification string. If the error is associated with a member
 * the member can be set here. */
hax.core.ActionError = function(msg,errorType,optionalMember) {
    this.msg = (msg != null) ? msg : hax.core.ActionError.UNKNOWN_ERROR_MESSAGE;
    this.errorType = errorType;
    this.member = optionalMember;
    
    this.isFatal = false;
    this.parentException = null;
}

hax.core.ActionError.UNKNOWN_ERROR_MESSAGE = "Unknown Error";

//"User App" - This is an error in the users application code
//"Custom Control - Update" - in "update" of custom control (cleared and set)
//"FolderFunction - Code" - error in setting the folderFunction function
//"User" - This is an operator error
//"Model" - This is an error in the data model, like a missing generator
//"Code" - error in use model code (I used on folderFunction and in code. Maybe I should split these.)
//"Calculate" - error when the object function is set as data (includes execution if necessary)
//
///** This is an error in the user model code. */
//hax.core.ActionError.ACTION_ERROR_MODEL = "model";
///** This is an error in the application code. */
//hax.core.ActionError.ACTION_ERROR_APP = "app";
///** This is an error in the user appliation level code, such as custom components. */
//hax.core.ActionError.ACTION_ERROR_USER_APP = "user app";
///** This is an operator error. */
//hax.core.ActionError.ACTION_ERROR_USER = "user";

/** This sets the exception that triggered this error. */
hax.core.ActionError.prototype.setParentException = function(exception) {
    this.parentException = exception;
}

/** This sets the exception that triggered this error. */
hax.core.ActionError.prototype.setIsFatal= function(isFatal) {
    this.isFatal = isFatal;
}

/** This returns true if this is a fatal error. */
hax.core.ActionError.prototype.getIsFatal= function() {
    return this.isFatal;
}

/** This gets the type of error. */
hax.core.ActionError.prototype.getType= function() {
    return this.errorType;
}

/** This method processes a fatal application exception, returning an ActionError object
 * marked as fatal. This should be use when the app lication is left in an unknown state. 
 * The resulting error message is the message from the
 * exception. An optional prefix may be added using the argument optionalErrorMsgPrefix.
 * This method also prints the stack trace for the exception. */
hax.core.ActionError.processException = function(exception,type,defaultToFatal,optionalErrorMsgPrefix) {  
    if(exception.stack) {
        console.error(exception.stack);
    }
    var errorMsg = optionalErrorMsgPrefix ? optionalErrorMsgPrefix : "";
    if(exception.message) errorMsg += exception.message;
    if(errorMsg.length == 0) errorMsg = "Unknown error";
    var actionError = new hax.core.ActionError(errorMsg,type,null);
    actionError.setParentException(exception);
	
    var isFatal;
	if(exception.isFatal !== undefined) {
		isFatal = exception.isFatal;
	}
	else {
		isFatal = defaultToFatal;
	}
	
    actionError.setIsFatal(isFatal);
    return actionError;
}


 ;
/** This namespace contains functions to process a create of a member */
hax.core.createmember = {};

/** member CREATED EVENT
 * This listener event is fired when after a member is created, to be used to respond
 * to the member update such as to update the UI.
 * 
 * Event member Format:
 * [member]
 */
hax.core.createmember.MEMBER_CREATED_EVENT = "memberCreated";

hax.core.createmember.fireCreatedEvent = function(member) {
    var workspace = member.getWorkspace();
    workspace.dispatchEvent(hax.core.createmember.MEMBER_CREATED_EVENT,member);
}

hax.core.createmember.fireCreatedEventList = function(memberList) {
    for(var i = 0; i < memberList.length; i++) {
        hax.core.createmember.fireCreatedEvent(memberList[i]);
    }
}

/** This method creates member according the input json, in the given folder.
 * The return value is an ActionResponse object. Optionally, an existing action response
 * may be passed in or otherwise one will be created here. */
hax.core.createmember.createMember = function(owner,json,optionalActionResponse) {
	var actionResponse = optionalActionResponse ? optionalActionResponse : new hax.core.ActionResponse();
    
    try {      
        var recalculateList = [];
        var creationList = [];
        
        var member = hax.core.createmember.instantiateMember(owner,json,creationList,actionResponse);
        
        //add the member to the action response
        actionResponse.member = member;

        var workspace = member.getWorkspace();
        workspace.updateDependeciesForModelChange(recalculateList);

        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);
        
        var updatedButNotCreated = hax.core.util.getListInFirstButNotSecond(recalculateList,creationList);

        //dispatch events
        hax.core.createmember.fireCreatedEventList(creationList);
        hax.core.updatemember.fireUpdatedEventList(updatedButNotCreated);
	}
	catch(error) {
        //unknown application error
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    //return response
	return actionResponse;
}

/** This method instantiates a member, without setting the update data. */
hax.core.createmember.instantiateMember = function(owner,json,creationList,actionResponse) {
    //create member
    var generator = hax.core.Workspace.getMemberGenerator(json.type);

    if(!generator) {
       //type not found
       var errorMsg = "Member type not found: " + json.type;
       var actionError = new hax.core.ActionError(errorMsg,"Model",null);
       
       actionResponse.addError(actionError);
       
       return null;
    }

    var childJsonOutputList = [];
    var member = generator.createMember(owner,json,childJsonOutputList);
    creationList.push(member);
    
    //instantiate children if there are any
    for(var i = 0; i < childJsonOutputList.length; i++) {
        var childJson = childJsonOutputList[i];
        hax.core.createmember.instantiateMember(member,childJson,creationList,actionResponse);
    }
    
    return member;
};
/** This namespace contains functions to process an update to an member
 * which inherits from the FunctionBase component. */
hax.core.updatemember = {};

/** member UPDATED EVENT
 * This listener event is fired when after a member is updated, to be used to respond
 * to the member update such as to update the UI.
 * 
 * Event member Format:
 * [member]
 */
hax.core.updatemember.MEMBER_UPDATED_EVENT = "memberUpdated";

hax.core.updatemember.CODE_APPLIED = 0;
hax.core.updatemember.DATA_APPLIED = 1;

hax.core.updatemember.fireUpdatedEvent = function(member) {
    var workspace = member.getWorkspace();
    workspace.dispatchEvent(hax.core.updatemember.MEMBER_UPDATED_EVENT,member);
}

hax.core.updatemember.fireUpdatedEventList = function(memberList) {
    for(var i = 0; i < memberList.length; i++) {
        hax.core.updatemember.fireUpdatedEvent(memberList[i]);
    }
}

/** This method updates the object function for a given member. 
 * The return value is an ActionResponse object. Optionally, an existing action response
 * may be passed in or otherwise one will be created here. */
hax.core.updatemember.updateCode = function(member,argList,functionBody,supplementalCode,optionalActionResponse) {
	var actionResponse = optionalActionResponse ? optionalActionResponse : new hax.core.ActionResponse();
    
    try {
        var recalculateList = [];

        hax.core.updatemember.applyCode(member,
            argList,
            functionBody,
            supplementalCode,
            recalculateList);
            
        //set dependencies
        member.initializeDependencies();
            
        hax.core.calculation.addToRecalculateList(recalculateList,member);

        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);
        
        //fire updated events
        hax.core.updatemember.fireUpdatedEventList(recalculateList);
    }
    catch(error) {
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    return actionResponse;
}

/** This method updates the data for a given member. 
 * The return value is an ActionResponse object. Optionally, an existing action response
 * may be passed in or otherwise one will be created here. */
hax.core.updatemember.updateData = function(member,data,optionalActionResponse) {
	var actionResponse = optionalActionResponse ? optionalActionResponse : new hax.core.ActionResponse();
    
    try {
        var recalculateList = [];

        hax.core.updatemember.applyData(member,data,recalculateList);
        
        hax.core.calculation.addToRecalculateList(recalculateList,member);

        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);

        //fire updated events
        hax.core.updatemember.fireUpdatedEvent(member);
        hax.core.updatemember.fireUpdatedEventList(recalculateList);
    }
    catch(error) {
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    return actionResponse;
}

/** This method updates the object function or the data for a list of members. 
 * The return value is an ActionResponse object. Optionally, an existing action response
 * may be passed in or otherwise one will be created here. */
hax.core.updatemember.updateObjects = function(updateDataList,optionalActionResponse) {
	var actionResponse = optionalActionResponse ? optionalActionResponse : new hax.core.ActionResponse();
    
    try {
        var recalculateList = [];   
        var setDataList = [];
             
        //process each member in the list
        for(var i = 0; i < updateDataList.length; i++) {
            var argData = updateDataList[i];
            var member = argData.member;
            
            var codeOrData = hax.core.updatemember.applyCodeOrData(member,argData);
            
            //if this is code we need to initialize
            //set dependencies
            if(codeOrData === hax.core.updatemember.CODE_APPLIED) {
                member.initializeDependencies();
            }
            else {
                setDataList.push(member);
            }
            
            //update recalculate list
            hax.core.calculation.addToRecalculateList(recalculateList,member);
        }

        //recalculate after all have been added
        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);

        //fire updated events
        hax.core.updatemember.fireUpdatedEventList(setDataList);
        hax.core.updatemember.fireUpdatedEventList(recalculateList);
    }
    catch(error) {
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    return actionResponse;
}

//=====================================
// Private Functions
//=====================================

hax.core.updatemember.applyCodeOrData = function(member,updateData) {
    var data = updateData.data;
    var argList = updateData.argList; 
    var functionBody = updateData.functionBody;
    var supplementalCode = updateData.supplementalCode;

    if(functionBody !== undefined) {
        hax.core.updatemember.applyCode(member,
            argList,
            functionBody,
            supplementalCode);
        return hax.core.updatemember.CODE_APPLIED;
    }
    else if(data !== undefined) {
        hax.core.updatemember.applyData(member,
            data);
        return hax.core.updatemember.DATA_APPLIED;
    }
}
/** This method updates the code and object function in a member based on the
 * passed code.*/
hax.core.updatemember.applyCode = function(codeable,argList,functionBody,supplementalCode) {
    
    var codeInfo ={};
    codeInfo.argList = argList;
    codeInfo.functionBody = functionBody;
    codeInfo.supplementalCode = supplementalCode;
    
    //load some needed context variables
    var codeLabel = codeable.getFullName();
    
    //process the code text into javascript code
    hax.core.codeCompiler.processCode(codeInfo,
        codeLabel);

    //save the code
    codeable.setCodeInfo(codeInfo);
}

/** This method sets the data for a member. */
hax.core.updatemember.applyData = function(dataHolder,data) {
    
    dataHolder.clearErrors();
    //clear the code if this is a codeable object
    if(dataHolder.isCodeable) {
        dataHolder.clearCode();
    }
    
    dataHolder.setData(data);
}



;
/** This namespace contains functions to process an update the object function
 *for a folderFunction. */
hax.core.updatefolderFunction = {};

hax.core.updatefolderFunction.updatePropertyValues = function(folderFunction,argList,returnValueString,recalculateList) {
    folderFunction.setArgList(argList);
    folderFunction.setReturnValueString(returnValueString);

    hax.core.calculation.addToRecalculateList(recalculateList,folderFunction);
}
;
/** This namespace contains functions to process a create of a member */
hax.core.movemember = {};

/** member MOVE EVENT
 * This listener event is fired when after a member is moveded, meaning either
 * the name or folder is updated. It is to be used to respond
 * to the member update such as to update the UI.
 * 
 * Event member Format:
 * [member]
 */
hax.core.movemember.MEMBER_MOVED_EVENT = "memberMoved";


hax.core.movemember.fireMovedEventList = function(movedMemberList,movedOldNameList,movedNewNameList) {
    for(var i = 0; i < movedMemberList.length; i++) {
        var member = movedMemberList[i];
        var workspace = member.getWorkspace();
        var memberInfo = {};
        memberInfo.member = member;
        memberInfo.oldFullName = movedOldNameList[i];
        memberInfo.newFullName = movedNewNameList[i];
        workspace.dispatchEvent(hax.core.movemember.MEMBER_MOVED_EVENT,memberInfo);
    }
}

/** This method creates member according the input json, in the given folder.
 * The return value is an ActionResponse object. Optionally, an existing action response
 * may be passed in or otherwise one will be created here. */
hax.core.movemember.moveMember = function(member,name,folder,recalculateList) {
        
    var movedMemberList = [];
    hax.core.movemember.loadMovedList(member,movedMemberList);
    var movedOldNameList = hax.core.movemember.getNameList(movedMemberList);
    member.move(name,folder);
    var movedNewNameList = hax.core.movemember.getNameList(movedMemberList);

    var workspace = member.getWorkspace();

    workspace.updateDependeciesForModelChange(recalculateList);
    
    var updatedButNotMoved = hax.core.util.getListInFirstButNotSecond(recalculateList,movedMemberList);

    //dispatch events
    hax.core.movemember.fireMovedEventList(movedMemberList,movedOldNameList,movedNewNameList);
    hax.core.updatemember.fireUpdatedEventList(updatedButNotMoved);
}

//this creates the moved info list, including the member and the old name, but not the new name
hax.core.movemember.loadMovedList = function(member,movedMemberList) {
    movedMemberList.push(member);
    
    if(member.isParent) {
        var childMap = member.getChildMap();
        for(var key in childMap) {
            var child = childMap[key];
            hax.core.movemember.loadMovedList(child,movedMemberList);
        }
    }
    else if(member.isRootHolder) {
        var root = member.getRoot();
        hax.core.movemember.loadMovedList(root,movedMemberList);
    }
}

//this adds the new name to the moved list
hax.core.movemember.getNameList = function(movedMemberList) {
    var nameList = [];
    for(var i = 0; i < movedMemberList.length; i++) {
        nameList[i] = movedMemberList[i].getFullName();
    }
    return nameList;
}
;
/** This namespace contains the action to delete a member. */
hax.core.deletemember = {};

/** MEMBER DELETED EVENT
 * This listener event is fired when after a member is deleted, to be used to respond
 * such as to update the UI.
 * 
 * Event object Format:
 * [child]
 */
hax.core.deletemember.MEMBER_DELETED_EVENT = "memberDeleted";

hax.core.deletemember.fireDeletedEventList = function(deleteInfoList) {
    for(var i = 0; i < deleteInfoList.length; i++) {
        var deleteInfo = deleteInfoList[i];
        var workspace = deleteInfo.workspace;
        workspace.dispatchEvent(hax.core.deletemember.MEMBER_DELETED_EVENT,deleteInfo);
    }
}


/** This method should be called to delete a child. The return value is an ActionResponse.
 * It will by default create its own action response object, however optionally an
 * existing action response may be passed in. */
hax.core.deletemember.deleteMember = function(member,optionalActionResponse) {
	var actionResponse = optionalActionResponse ? optionalActionResponse : new hax.core.ActionResponse();
    
    try {
        
        var recalculateList = [];
        var deleteInfoList = [];
        
        var workspace = member.getWorkspace();
        
        hax.core.deletemember.fillDeleteInfoList(member,deleteInfoList);
        for(var i = 0; i < deleteInfoList.length; i++) {
            //call delete handlers
            var deleteInfo = deleteInfoList[i];
            var member = deleteInfo.member;
            member.onDeleteChild();
            if(member.isDependent) {
                member.onDeleteDependent();
            }
            
        }
        workspace.updateDependeciesForModelChange(recalculateList);

        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);

        //dispatch events
        hax.core.deletemember.fireDeletedEventList(deleteInfoList);
        hax.core.updatemember.fireUpdatedEventList(recalculateList);
	}
	catch(error) {
        //unknown application error
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    //return response
    return actionResponse;
        
}


hax.core.deletemember.fillDeleteInfoList =  function(member,deleteInfoList) {
    var deleteInfo = {};
    deleteInfo.member = member;
    deleteInfo.workspace = member.getWorkspace();
    deleteInfo.fullName = member.getFullName();
    deleteInfoList.push(deleteInfo);
    if(member.isParent) {
        var childMap = member.getChildMap();
        for(var key in childMap) {
            var child = childMap[key];
            hax.core.deletemember.fillDeleteInfoList(child,deleteInfoList);
        }
    }
    else if(member.isRootHolder) {
        var root = member.getRoot();
        hax.core.deletemember.fillDeleteInfoList(root,deleteInfoList);
    }
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////

};

generator(exports);



