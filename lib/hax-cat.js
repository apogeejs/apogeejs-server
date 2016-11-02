/** Main project name space */
hax = {};

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
    globalVarEntry.data = window;
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



;
/** This is the main visiui file */
hax.visiui = {};


//I put some utilities in here. I shoudl figure out a better place to put this.

//=====================================
// ZIndex Constants
//=====================================
hax.visiui.MENU_ZINDEX = 100;
hax.visiui.WINDOW_FRAME_ZINIDEX = 10;
hax.visiui.DIALOG_ZINDEX = 200;

//======================================
// ID Generator
//======================================

hax.visiui.idIndex = 0;
hax.visiui.idBase = "_visiui_id_";

/** This method generates a generic id for dom elements. */
hax.visiui.createId = function() {
    return hax.visiui.idBase + hax.visiui.idIndex++;
}

//=========================================
// style methods
//=========================================

/** This method applies the style json to the dom element. */
hax.visiui.applyStyle = function(element,style) {
    for(var key in style) {
        element.style[key] = style[key];
    }
}

//=========================================
// screate dom methods
//=========================================

/** This method applies the style json to the dom element. All arguments
 * besides type are optional.
 * 
 * type is the element type
 * properties are javascript properties, 
 * styleProperties are the style properties
 * */
hax.visiui.createElement = function(type,properties,styleProperties) {
    var element = document.createElement(type);
    if(properties) {
        for(var key in properties) {
            element[key] = properties[key];
        }
    }
    if(styleProperties) {
        hax.visiui.applyStyle(element,styleProperties);
    }
    return element;
}

//=========================================
// window and dialog methods
//=========================================

hax.visiui.dialogLayer = null;

hax.visiui.BASE_ELEMENT_STYLE = {
    "position":"absolute",
    "left":"0px",
    "right":"0px",
    "top":"0px",
    "bottom":"0px",
    "zIndex":1
}

hax.visiui.DIALOG_LAYER_STYLE = {
    "position":"absolute",
    "left":"0px",
    "right":"0px",
    "top":"0px",
    "bottom":"0px",
    "zIndex": 2,
    "pointerEvents": "none"
}

hax.visiui.DIALOG_SHIELD_STYLE = {
    "position":"absolute",
    "left":"0px",
    "right":"0px",
    "top":"0px",
    "bottom":"0px",
    "pointerEvents": "auto"
}
    
hax.visiui.initWindows = function(appElementId) {
    //create the ui elements from the app element
    var appContainer = document.getElementById(appElementId);
    if(!appContainer) {
        throw hax.core.util.createError("Container ID not found: " + appElementId);
    }
    
    var elements = {};
    elements.baseElement = hax.visiui.createElement("div",null,hax.visiui.BASE_ELEMENT_STYLE); 
    elements.dialogLayer = hax.visiui.createElement("div",null,hax.visiui.DIALOG_LAYER_STYLE);
    
    appContainer.appendChild(elements.baseElement);
    appContainer.appendChild(elements.dialogLayer);
    
    hax.visiui.dialogLayer = elements.dialogLayer;
    
    return elements;
}

/** This method creates a normal window which is situated above a shiled layer blocking
 *out events to the app, making the dialog like a modal dialog. If this function is used
 *to create a dialog, it must be closed with the hax.visiui.closeDialog function to
 *remove the modal layer, whether or not the dialog was shown. The options passed are the 
 *normal options for a window frame. (Note - if there are other events with whihc to act with
 *the app they may need to be shileded too.) */
hax.visiui.createDialog = function(options) {
    var shieldElement = hax.visiui.createElement("div",null,hax.visiui.DIALOG_SHIELD_STYLE);
    var dialogParent = new hax.visiui.SimpleParentContainer(shieldElement,true);
    hax.visiui.dialogLayer.appendChild(shieldElement);
    
    if(!options.frameColorClass) options.frameColorClass = "visicomp_windowColor";
    if(!options.titleBarClass) options.titleBarClass = "visicomp_titleBarClass";
    return new hax.visiui.WindowFrame(dialogParent,options);
}

/** This method closes a dialog created with hax.visiui.createDialog. It
 *hides the window and removes the modal shiled. */
hax.visiui.closeDialog = function(dialog) {
    var parent = dialog.getParent();
    dialog.hide();
    hax.visiui.dialogLayer.removeChild(parent.getContainerElement());
}





;
/** This is a mixin that encapsulates the base functionality of a parent container for a control
 * The parent container must provide events for when is is shown, hidden.
 * 
 * This is not a class, but it is used for the prototype of the objects that inherit from it.
 */
hax.visiui.ParentContainer = {};
    
/** This is the initializer for the component. The object passed is the core object
 * associated with this control. */
hax.visiui.ParentContainer.init = function(containerElement, eventManager) {
    this.containerElement = containerElement;
    this.eventManager = eventManager;
    
    this.windowFrameStack = [];
    
    //child auto positioning variables
    this.prevNewChildX = 0;
    this.prevNewChildY = 0;
    this.wrapCount = 0;
}

hax.visiui.ParentContainer.BASE_ZINDEX = 0;

//constants for window placement
hax.visiui.ParentContainer.DELTA_CHILD_X = 75;
hax.visiui.ParentContainer.DELTA_CHILD_Y = 75;
hax.visiui.ParentContainer.MIN_WRAP_WIDTH = 20; 
hax.visiui.ParentContainer.MIN_WRAP_HEIGHT = 200;

//events
hax.visiui.ParentContainer.CONTENT_SHOWN = "content shown";
hax.visiui.ParentContainer.CONTENT_HIDDEN = "content hidden";

//==============================
// Public Instance Methods
//==============================

///** This method must be implemented in inheriting objects. */
//hax.visiui.ParentContainer.getContentIsShowing = function();

/** This returns the dom element taht contains the child. */
hax.visiui.ParentContainer.getContainerElement = function() {
    return this.containerElement;
}

/** This gets the event manager associated with window evetns for the container, such as resize. */
hax.visiui.ParentContainer.getEventManager = function() {
    return this.eventManager;
}


/** This method adds a windows to the parent. It does not show the window. Show must be done. */
hax.visiui.ParentContainer.addWindow = function(windowFrame) {
    this.containerElement.appendChild(windowFrame.getElement());
    this.windowFrameStack.push(windowFrame);
    this.updateOrder();
}

/** This method removes the window from the parent container. */
hax.visiui.ParentContainer.removeWindow = function(windowFrame) {
    this.containerElement.removeChild(windowFrame.getElement());
    var index = this.windowFrameStack.indexOf(windowFrame);
    this.windowFrameStack.splice(index,1);
    this.updateOrder();
}

/** This brings the given window to the front inside this container. */
hax.visiui.ParentContainer.bringToFront = function(windowFrame) {
    //remove from array
    var index = this.windowFrameStack.indexOf(windowFrame);
    this.windowFrameStack.splice(index,1);
    //readd at the end
    this.windowFrameStack.push(windowFrame);
    this.updateOrder();
}

/** This method centers the dialog on the page. It must be called after the conten
 * is set, and possibly after it is rendered, so the size of it is calculated. */
hax.visiui.ParentContainer.getCenterOnPagePosition = function(child) {
    var element = child.getElement();
    var x = (this.containerElement.offsetWidth - element.clientWidth)/2;
    var y = (this.containerElement.offsetHeight - element.clientHeight)/2;
    return [x,y];
}


/** This method returns the position of the next window for auto/cascade positioning. */
hax.visiui.ParentContainer.getNextWindowPosition = function() {
    var x = this.prevNewChildX + hax.visiui.ParentContainer.DELTA_CHILD_X;
    var y = this.prevNewChildY + hax.visiui.ParentContainer.DELTA_CHILD_Y;
    
    if( ((x > this.containerElement.offsetWidth)&&(x > hax.visiui.ParentContainer.MIN_WRAP_WIDTH)) && 
        ((y > this.containerElement.offsetHeight)&&(y > hax.visiui.ParentContainer.MIN_WRAP_HEIGHT)) ) {
        this.wrapCount++;
        x = hax.visiui.ParentContainer.DELTA_CHILD_X * (this.wrapCount + 1);
        y = hax.visiui.ParentContainer.DELTA_CHILD_Y;
    }
    
    this.prevNewChildX = x;
    this.prevNewChildY = y;
    
    return [x,y];
}

//=========================
// Private Methods
//=========================

/** This updates the order for the windows.
 * @private */
hax.visiui.ParentContainer.updateOrder = function() {
    var zIndex = hax.visiui.ParentContainer.BASE_ZINDEX;
    for(var i = 0; i < this.windowFrameStack.length; i++) {
        var windowFrame = this.windowFrameStack[i];
        windowFrame.setZIndex(zIndex++);
    }
};
/** This is a mixin is used by parents to highlight children, to display to which
 * parent a child belons.
 * 
 * This is not a class, but it is used for the prototype of the objects that inherit from it.
 */
hax.visiui.ParentHighlighter = {};
    
/** This is the initializer for the component. The object passed is the core object
 * associated with this control. */
hax.visiui.ParentHighlighter.init = function(containerElement) {

this.borderOutlineStyle = "solid 3px " + hax.visiui.ParentHighlighter.getColor();
containerElement.style.border = this.borderOutlineStyle;
}

/** This method adds a windows to the parent. It does not show the window. Show must be done. */
hax.visiui.ParentHighlighter.addWindow = function(windowFrame) {
	
var windowElement = windowFrame.getElement();
windowElement.style.outline = this.borderOutlineStyle;
	
    hax.visiui.ParentContainer.addWindow.call(this,windowFrame);
}

/** This method removes the window from the parent container. */
hax.visiui.ParentHighlighter.removeWindow = function(windowFrame) {
var windowElement = windowFrame.getElement();
windowElement.style.outline = "";
	
    hax.visiui.ParentContainer.removeWindow.call(this,windowFrame);
}

//==========================
// Static method (even though it is inherited by objects)
//==========================
hax.visiui.ParentHighlighter.colorIndex = 0;
hax.visiui.ParentHighlighter.getColor = function() {
	var colorString = hax.visiui.ParentHighlighter.colorArray[hax.visiui.ParentHighlighter.colorIndex];
	hax.visiui.ParentHighlighter.colorIndex = (hax.visiui.ParentHighlighter.colorIndex + 1) % hax.visiui.ParentHighlighter.colorArray.length;
	return colorString;
}

hax.visiui.ParentHighlighter.colorArray = [
    "DimGray",
    "Indigo",
    "DarkCyan",
    "LimeGreen",
    "RebeccaPurple",
    "MediumBlue",
    "DarkGoldenRod",
    "Navy",
    "MediumSeaGreen",
    "DarkViolet",
    "ForestGreen",
    "RoyalBlue",
    "Chocolate",
    "Red",
    "Purple",
    "DarkSlateGray",
    "OliveDrab",
    "DarkRed",
    "MidnightBlue",
    "Brown",
    "DarkMagenta",
    "DarkSlateBlue",
    "Green",
    "Sienna",
    "FireBrick",
    "Blue",
    "Olive",
    "SteelBlue",
    "Teal",
    "IndianRed",
    "MediumVioletRed",
    "SlateGray",
    "SaddleBrown",
    "SeaGreen",
    "Chartreuse",
    "LightSeaGreen",
    "DarkBlue",
    "Crimson",
    "Lime",
    "LawnGreen",
    "DarkOliveGreen",
    "OrangeRed",
    "Maroon",
    "DarkOrange",
    "Gray",
    "SpringGreen"
];

;
/** This is a window frame component. IT is used the table window and the dialog.
 *
 * It can be minimized an maximized and dragged and resized with the mouse.  
 * 
 * options:
 * minimizable - allow content to be minimized. defaylt value: false
 * maximizable - allow content to be maximized. defaylt value: false
 * closable - display a close button. defalt value: false
 * resizable- allow resizing window with mouse. default vlue: false
 * movable - allow moving window with mouse. default value : false
 *
 * @class 
 */
hax.visiui.WindowFrame = function(parentContainer, options) {
	
    //set the options
    if(!options) {
        options = {};
    }
    
    if(!options.frameColorClass) options.frameColorClass = hax.visiui.WindowFrame.DEFAULT_FRAME_COLOR_CLASS;
    if(!options.titleBarClass) options.titleBarClass = hax.visiui.WindowFrame.DEFAULT_TITLE_BAR_CLASS;
    
    //base init
    hax.core.EventManager.init.call(this);
	
    //variables
    this.parentContainer = parentContainer;
    this.parentElement = parentContainer.getContainerElement();
    this.options = options;

    this.windowState = hax.visiui.WindowFrame.NORMAL; //minimize, normal, maximize
    
	//set default size values
	this.coordinateInfo = {};
	this.coordinateInfo.x = 0;
	this.coordinateInfo.y = 0;
	this.coordinateInfo.width = hax.visiui.WindowFrame.DEFAULT_WINDOW_WIDTH;
	this.coordinateInfo.height = hax.visiui.WindowFrame.DEFAULT_WINDOW_HEIGHT;
	
    this.isShowing = false;
	
    this.frame = null;
    this.titleCell = null;
    this.bodyCell = null;
    this.headerCell = null;
    
    this.titleBar = null;
    this.titleBarLeftElements = null;
    this.titleBarRightElements = null;
    
    this.header = null;
    
    this.body = null;
    this.content = null;
    
    this.minimizeButton = null;
    this.restoreButton = null;
    this.maximizeButton = null;
    this.closable = null;
    
    this.windowDragActive = false;
    this.moveOffsetX = null;
    this.moveOffsetX = null;
    //handlers we place on the parent during a move
    this.moveOnMouseMove = null;
    this.moveOnMouseLeave = null;
    this.moveOnMouseUp = null;
	
	this.resizeEastActive = false;
	this.resizeWestActive = false;
	this.resizeNorthActive = false;
	this.resizeSouthActive = false;
	this.resizeOffsetWidth = null;
	this.resizeOffsetHeight = null;
    //hanlders we place on the parent during a resize
	this.resizeOnMouseUp = null;
	this.resizeOnMouseMove = null;
	this.resizeOnMouseLeave = null;
	
	//these should be set to soemthing more meeaningful, like the minimum sensible width of the title bar
	this.minWidth = 0;
	this.minHeight = 0;
	
    //initialize
    this.initUI();
	
    //add the handler to move the active window to the front
    var instance = this;
	var frontHandler = function(e) {
        instance.parentContainer.bringToFront(instance);
    };
    var element = this.getElement();
	element.addEventListener("mousedown",frontHandler);
    
    //this makes sure to update the window when the parent becomes visible
    this.onShow = function() {
        //refresh the element
        instance.show();
    }
    this.onHide = function() {
        //don't remove element, but mark it as hidden
        instance.isShowing = false;
    }
    var parentEventManager = this.parentContainer.getEventManager();
    parentEventManager.addListener(hax.visiui.ParentContainer.CONTENT_SHOWN, this.onShow);
    parentEventManager.addListener(hax.visiui.ParentContainer.CONTENT_HIDDEN, this.onHide);
}

//add components to this class
hax.core.util.mixin(hax.visiui.WindowFrame,hax.core.EventManager);

hax.visiui.WindowFrame.MINIMIZED = -1;
hax.visiui.WindowFrame.NORMAL = 0;
hax.visiui.WindowFrame.MAXIMIZED = 1;

hax.visiui.WindowFrame.MINIMIZE_CMD_IMAGE = hax.RESOURCE_DIR + "/minimize.png";
hax.visiui.WindowFrame.RESTORE_CMD_IMAGE = hax.RESOURCE_DIR + "/restore.png";
hax.visiui.WindowFrame.MAXIMIZE_CMD_IMAGE = hax.RESOURCE_DIR + "/maximize.png";
hax.visiui.WindowFrame.CLOSE_CMD_IMAGE = hax.RESOURCE_DIR + "/close.png";
hax.visiui.WindowFrame.MENU_IMAGE = hax.RESOURCE_DIR + "/hamburger.png";

hax.visiui.WindowFrame.RESIZE_LOCATION_SIZE = 10;

//constants for resizing
hax.visiui.WindowFrame.RESIZE_TOLERANCE = 5;
hax.visiui.WindowFrame.RESIZE_EAST = 1;
hax.visiui.WindowFrame.RESIZE_WEST = 2;
hax.visiui.WindowFrame.RESIZE_SOUTH = 4;
hax.visiui.WindowFrame.RESIZE_NORTH = 8;
hax.visiui.WindowFrame.RESIZE_NE = hax.visiui.WindowFrame.RESIZE_NORTH + hax.visiui.WindowFrame.RESIZE_EAST;
hax.visiui.WindowFrame.RESIZE_NW = hax.visiui.WindowFrame.RESIZE_NORTH + hax.visiui.WindowFrame.RESIZE_WEST;
hax.visiui.WindowFrame.RESIZE_SE = hax.visiui.WindowFrame.RESIZE_SOUTH + hax.visiui.WindowFrame.RESIZE_EAST;
hax.visiui.WindowFrame.RESIZE_SW = hax.visiui.WindowFrame.RESIZE_SOUTH + hax.visiui.WindowFrame.RESIZE_WEST;

/** size must be speicifed for the window. If not these values are used. */
hax.visiui.WindowFrame.DEFAULT_WINDOW_HEIGHT = 300;
hax.visiui.WindowFrame.DEFAULT_WINDOW_WIDTH = 300;

hax.visiui.WindowFrame.DEFAULT_TITLE_BAR_CLASS = "visiui_win_titleBarClass";
hax.visiui.WindowFrame.DEFAULT_FRAME_COLOR_CLASS = "visiui_win_windowColorClass";

//======================================
// CSS STYLES
//======================================

hax.visiui.WindowFrame.TITLE_BAR_LEFT_STYLE = {
    //fixed
    "display":"inline",
    "width":"100%"
};

hax.visiui.WindowFrame.TITLE_BAR_RIGHT_STYLE = {
    //fixed
    "float":"right",
    "display":"inline"
};

hax.visiui.WindowFrame.TITLE_STYLE = {
    //fixed
    "display":"inline-block",
    "cursor":"default",
    "font-weight":"bold",
    "color":"darkblue"
    
};

hax.visiui.WindowFrame.COMMAND_BUTTON_STYLE = { 
    //fixed
    "display":"inline-block",

    //configurable
    "marginRight":"3px"
};

//====================================
// Public Methods
//====================================

hax.visiui.WindowFrame.prototype.getTitle = function(title) {
    return this.title;
}

/** This method sets the title on the window frame.
 * This will be added to the title bar in the order it was called. The standard
 * location for the menu is immediately after the menu, if the menu is present. */
hax.visiui.WindowFrame.prototype.setTitle = function(title) {
	if((title === null)||(title === undefined)||(title.length === 0)) {
		title = "&nbsp;";
	}
    //title
    this.title = title;
    if(!this.titleElement) {
        this.titleElement = document.createElement("div");
        hax.visiui.applyStyle(this.titleElement,hax.visiui.WindowFrame.TITLE_STYLE);
    }
    this.titleElement.innerHTML = title;
    this.titleBarLeftElements.appendChild(this.titleElement);
}

/** This gets the menu for the window frame. If this is called, a menu will be added
 * to the window frame, empty or otherwise. If it is not called, there will be no menu. 
 * This will be added to the title bar in the order it was called. The standard
 * location for the menu is first. */
hax.visiui.WindowFrame.prototype.getMenu = function() {
    if(!this.menu) {
        this.menu = hax.visiui.Menu.createMenuFromImage(hax.visiui.WindowFrame.MENU_IMAGE);
		var firstLeftElementChild = this.titleBarLeftElements.firstChild;
		if(firstLeftElementChild) {
			this.titleBarLeftElements.insertBefore(this.menu.getElement(),firstLeftElementChild);
		}
		else {
			this.titleBarLeftElements.appendChild(this.menu.getElement());
		}
    }
    return this.menu;
}

/** This method sets the headers for the window. They appreare between the title
 * bar and the body. The elements should typicaly be "block" type components, such
 * as a div.
 */
hax.visiui.WindowFrame.prototype.loadHeaders = function(headerElements) {
    hax.core.util.removeAllChildren(this.headerElement);
    if(headerElements.length > 0) {
        for(var i = 0; i < headerElements.length; i++) {
			this.headerElement.appendChild(headerElements[i]);
		}
    }
}

/** This method shows the window. */
hax.visiui.WindowFrame.prototype.changeParent = function(newParentContainer) {
    this.hide();
    var oldParentContainer = this.parentContainer;
    var oldParentEventManager = oldParentContainer.getEventManager();
    oldParentEventManager.removeListener(hax.visiui.ParentContainer.CONTENT_SHOWN, this.onShow);
    oldParentEventManager.removeListener(hax.visiui.ParentContainer.CONTENT_HIDDEN, this.onHide);
    
    this.parentContainer = newParentContainer;
    this.parentElement = newParentContainer.getContainerElement();
    
    var newParentEventManager = newParentContainer.getEventManager();
    newParentEventManager.addListener(hax.visiui.ParentContainer.CONTENT_SHOWN, this.onShow);
    newParentEventManager.addListener(hax.visiui.ParentContainer.CONTENT_HIDDEN, this.onHide);
    this.show();
}

/** This method shows the window. */
hax.visiui.WindowFrame.prototype.show = function() {
    if(this.isShowing) return;
    
    //add window to the parent
    this.parentContainer.addWindow(this);

    if(this.parentContainer.getContentIsShowing()) {
        this.isShowing = true;
        this.frameShown();

        //we will redo this since the size of elements used in calculation may have been wrong
        if(this.coordinateInfo.height !== undefined) {
            this.updateCoordinates();
        }
    }
}

/** This method hides the window. */
hax.visiui.WindowFrame.prototype.hide = function() {
    this.parentContainer.removeWindow(this);
    if(this.isShowing) {
        this.isShowing = false;
        this.frameHidden();
    }
}

/** This method closes the window. */
hax.visiui.WindowFrame.prototype.deleteWindow = function() {
    var parentEventManager = this.parentContainer.getEventManager();
    parentEventManager.removeListener(hax.visiui.ParentContainer.CONTENT_SHOWN, this.onShow);
    parentEventManager.removeListener(hax.visiui.ParentContainer.CONTENT_HIDDEN, this.onHide);
    this.hide();
}

/** This method returns true if the window is showing. */
hax.visiui.WindowFrame.prototype.getIsShowing = function() {
    return this.isShowing;
}

/** This method returns true if the window is showing. */
hax.visiui.WindowFrame.prototype.getContentIsShowing = function() {
    return (this.isShowing)&&(this.windowState != hax.visiui.WindowFrame.MINIMIZED);
}

/** This method sets the position of the window frame in the parent. */
hax.visiui.WindowFrame.prototype.setPosition = function(x,y) {
	//don't let window be placed at a negative coord. We can lose it.
	if(x < 0) x = 0;
	if(y < 0) y = 0;
	this.coordinateInfo.x = x;
	this.coordinateInfo.y = y;
	
    this.updateCoordinates();
}

/** This method sets the size of the window frame, including the title bar. */
hax.visiui.WindowFrame.prototype.setSize = function(width,height) {
    this.coordinateInfo.width = width;
	this.coordinateInfo.height = height;
    
    this.updateCoordinates();
}

/** This method sets the size of the window to fit the content. It should only be 
 * called after the window has been shown. The argument passed should be the element
 * that holds the content and is sized to it. */
hax.visiui.WindowFrame.prototype.fitToContent = function(contentContainer) {
	//figure out how big to make the frame to fit the content
    var viewWidth = this.body.offsetWidth;
    var viewHeight = this.body.offsetHeight;
    var contentWidth = contentContainer.offsetWidth;
    var contentHeight = contentContainer.offsetHeight;
	
	var targetWidth = this.coordinateInfo.width + contentWidth - viewWidth + hax.visiui.WindowFrame.FIT_WIDTH_BUFFER;
	var targetHeight = this.coordinateInfo.height + contentHeight - viewHeight + hax.visiui.WindowFrame.FIT_HEIGHT_BUFFER;
	
    this.setSize(targetWidth,targetHeight);
}

/** This method centers the window in its parent. it should only be called
 *after the window is shown. */
hax.visiui.WindowFrame.prototype.centerInParent = function() {
    var coords = this.parentContainer.getCenterOnPagePosition(this);
    this.setPosition(coords[0],coords[1]);
}

/** @private */
hax.visiui.WindowFrame.FIT_HEIGHT_BUFFER = 20;
/** @private */
hax.visiui.WindowFrame.FIT_WIDTH_BUFFER = 20;
	
/** This method gets the location and size info for the window. */
hax.visiui.WindowFrame.prototype.getCoordinateInfo= function() {
    return this.coordinateInfo;
}

/** This method sets the location and size info for the window. */
hax.visiui.WindowFrame.prototype.setCoordinateInfo= function(coordinateInfo) {
    this.coordinateInfo = coordinateInfo;
    this.updateCoordinates();
}

/** This method gets the location and size info for the window. */
hax.visiui.WindowFrame.prototype.getWindowState = function() {
    return this.windowState;
}

/** This method sets the location and size info for the window. */
hax.visiui.WindowFrame.prototype.setWindowState = function(windowState) {
    switch(windowState) {
        case hax.visiui.WindowFrame.NORMAL:
            this.restoreContent();
            break;
            
        case hax.visiui.WindowFrame.MINIMIZED:
            this.minimizeContent();
            break;
            
        case hax.visiui.WindowFrame.MAXIMIZED:
            this.maximizeContent();
            break;
            
        default:
            alert("Unknown window state: " + windowState);
            break;
    }
}

/** This method returns the main dom element for the window frame. */
hax.visiui.WindowFrame.prototype.getElement = function() {
    return this.frame;
}

/** This method returns the window body.*/
hax.visiui.WindowFrame.prototype.getBody = function() {
    return this.body;
}

/** This method returns the window body.*/
hax.visiui.WindowFrame.prototype.getParent = function() {
    return this.parentContainer;
}

/** This method sets a content element in the body. Alternatively the body can 
 * be retrieved and loaded as desired. */
hax.visiui.WindowFrame.prototype.setContent = function(element) {
    //remove the old content
    while(this.body.firstChild) {
        this.body.removeChild(this.body.firstChild);
    }
	
    //add the new content
    this.content = element;
    if(this.content) {
        this.body.appendChild(this.content);
    }
}

/** This method sets the size of the window, including the title bar and other decorations. */
hax.visiui.WindowFrame.prototype.setZIndex = function(zIndex) {
    this.frame.style.zIndex = String(zIndex);
}

/** This method sets the content for the body. To clear the content, pass null.*/
hax.visiui.WindowFrame.prototype.addTitleBarElement = function(element) {
    this.titleBarLeftElements.appendChild(element);
}

/** This method sets the content for the body. To clear the content, pass null.*/
hax.visiui.WindowFrame.prototype.removeTitleBarElement = function(element) {
    this.titleBarLeftElements.appendRemove(element);
}

/** This method sets the content for the body. To clear the content, pass null.*/
hax.visiui.WindowFrame.prototype.addRightTitleBarElement = function(element) {
    if(this.titleBarRightElements.firstChild) {
		this.titleBarRightElements.insertBefore(element,this.titleBarRightElements.firstChild);
	}
    else {
        this.titleBarRightElements.appendChild(element);
    }
}

/** This method sets the content for the body. To clear the content, pass null.*/
hax.visiui.WindowFrame.prototype.removeRightTitleBarElement = function(element) {
    this.titleBarRightElements.appendRemove(element);
}

//====================================
// Motion/Reseize Event Handlers and functions
//====================================

/** Mouse down handler for moving the window. */
hax.visiui.WindowFrame.prototype.moveMouseDown = function(e) {
    //do not do move in maximized state
    if(this.windowState === hax.visiui.WindowFrame.MAXIMIZED) return;
    
    if(this.parentElement) {
        this.windowDragActive = true;
        this.moveOffsetX = e.clientX - this.frame.offsetLeft;
        this.moveOffsetY = e.clientY - this.frame.offsetTop;
		
        //add move events to the parent, since the mouse can leave this element during a move
        this.parentElement.addEventListener("mousemove",this.moveOnMouseMove);
        this.parentElement.addEventListener("mouseleave",this.moveOnMouseLeave);
        this.parentElement.addEventListener("mouseup",this.moveOnMouseUp);
        
        //move start event would go here
    }
}

/** Mouse m,ove handler for moving the window. */
hax.visiui.WindowFrame.prototype.moveMouseMove = function(e) {
    if(!this.windowDragActive) return;
	var newX = e.clientX - this.moveOffsetX;
	if(newX < 0) newX = 0;
	var newY = e.clientY - this.moveOffsetY;
	if(newY < 0) newY = 0;
    this.coordinateInfo.x = newX;
    this.coordinateInfo.y = newY;
    this.updateCoordinates();
}

/** Mouse up handler for moving the window. */
hax.visiui.WindowFrame.prototype.moveMouseUp = function(e) {
    this.endMove();
}

/** Mouse leave handler for moving the window. */
hax.visiui.WindowFrame.prototype.moveMouseLeave = function(e) {
    this.endMove();
}

/** Mouse down handler for resizing the window. */
hax.visiui.WindowFrame.prototype.resizeMouseDown = function(e,resizeFlags) {
    //do not do resize in maximized state
    if(this.windowState === hax.visiui.WindowFrame.MAXIMIZED) return;

	if(resizeFlags) {
		if(resizeFlags & hax.visiui.WindowFrame.RESIZE_EAST) {
			this.resizeEastActive = true;
			this.resizeOffsetWidth = e.clientX - this.frame.clientWidth;
		}
		else if(resizeFlags & hax.visiui.WindowFrame.RESIZE_WEST) {
			this.resizeWestActive = true;
			this.resizeOffsetWidth = e.clientX + this.frame.clientWidth;
			this.moveOffsetX = e.clientX - this.frame.offsetLeft;
		}
		if(resizeFlags & hax.visiui.WindowFrame.RESIZE_SOUTH) {
			this.resizeSouthActive = true;
			this.resizeOffsetHeight = e.clientY - this.frame.clientHeight;
		}
		else if(resizeFlags & hax.visiui.WindowFrame.RESIZE_NORTH) {
			this.resizeNorthActive = true;
			this.resizeOffsetHeight = e.clientY + this.frame.clientHeight;
			this.moveOffsetY = e.clientY - this.frame.offsetTop;
		}

        //add resize events to the parent, since the mouse can leave this element during a move
		this.parentElement.addEventListener("mouseup",this.resizeOnMouseUp);
		this.parentElement.addEventListener("mousemove",this.resizeOnMouseMove);
        this.parentElement.addEventListener("mouseleave",this.resizeOnMouseLeave);
	}
}

/** Mouse move handler for resizing the window. */
hax.visiui.WindowFrame.prototype.resizeMouseMove = function(e) {
    var newHeight;
    var newWidth;
    var newX;
    var newY;
    var changeMade = false;
    
	if(this.resizeEastActive) {
		newWidth = e.clientX - this.resizeOffsetWidth;
		if(newWidth < this.minWidth) return;
        this.coordinateInfo.width = newWidth;
        changeMade = true;
	}
	else if(this.resizeWestActive) {
		newWidth = this.resizeOffsetWidth - e.clientX;
		if(newWidth < this.minWidth) return;
		newX = e.clientX - this.moveOffsetX;
		if(newX < 0) newX = 0;
        this.coordinateInfo.width = newWidth;
        this.coordinateInfo.x = newX;
        changeMade = true;
	}
	if(this.resizeSouthActive) {
		newHeight = e.clientY - this.resizeOffsetHeight;
		if(newHeight < this.minHeight) return;
		this.coordinateInfo.height = newHeight;
        changeMade = true;
	}
	else if(this.resizeNorthActive) {
		newHeight = this.resizeOffsetHeight - e.clientY;
		if(newHeight < this.minHeight) return;
		newY = e.clientY - this.moveOffsetY;
		if(newY < 0) newY = 0;
		this.coordinateInfo.height = newHeight;
		this.coordinateInfo.y = newY;
        changeMade = true;
	}
        
    if(changeMade) {
        //update coordinates
        this.updateCoordinates();
    }
}

/** Mouse up handler for resizing the window. */
hax.visiui.WindowFrame.prototype.resizeMouseUp = function(e) {
    this.endResize();
}

/** Mouse up handler for resizing the window. */
hax.visiui.WindowFrame.prototype.resizeMouseLeave = function(e) {
    this.endResize();
}


/** This method ends a move action. 
 * @private */
hax.visiui.WindowFrame.prototype.endMove = function(e) {
    this.windowDragActive = false;
    this.parentElement.removeEventListener("mousemove",this.moveOnMouseMove);
    this.parentElement.removeEventListener("mouseup",this.moveOnMouseUp);
}

/** this method ends a resize action.
 * @private */
hax.visiui.WindowFrame.prototype.endResize = function() {
	this.resizeEastActive = false;
	this.resizeWestActive = false;
	this.resizeSouthActive = false;
	this.resizeNorthActive = false;
	this.parentElement.removeEventListener("mouseup",this.resizeOnMouseUp);
	this.parentElement.removeEventListener("mousemove",this.resizeOnMouseMove);
}

//====================================
//  Min/max Methods
//====================================

/** This is the minimize function for the window.*/
hax.visiui.WindowFrame.prototype.minimizeContent = function() {
    
    //set body as hidden
    this.body.style.display = "none";
    
    var wasMinimized = (this.windowState === hax.visiui.WindowFrame.MINIMIZED);
    var wasMaximized = (this.windowState === hax.visiui.WindowFrame.MAXIMIZED);
 
    //set the window state
    this.windowState = hax.visiui.WindowFrame.MINIMIZED;
    this.updateCoordinates();
    this.setMinMaxButtons();
    
    //dispatch resize event
    if(!wasMinimized) this.contentOnlyHidden();
}

/** This is the restore function for the window.*/
hax.visiui.WindowFrame.prototype.restoreContent = function() {
    
    //set body as not hidden
    this.body.style.display = "";
    
    var wasMinimized = (this.windowState === hax.visiui.WindowFrame.MINIMIZED);
    var wasMaximized = (this.windowState === hax.visiui.WindowFrame.MAXIMIZED);
    
    //set the window state
    this.windowState = hax.visiui.WindowFrame.NORMAL;
    this.updateCoordinates();
    this.setMinMaxButtons();
    
    if(wasMinimized) this.contentOnlyShown();
}

/** This is the minimize function for the window.*/
hax.visiui.WindowFrame.prototype.maximizeContent = function() {
    
    //set body as not hidden
    this.body.style.display = "";
    
    var wasMinimized = (this.windowState === hax.visiui.WindowFrame.MINIMIZED);
    
    //set the window state
    this.windowState = hax.visiui.WindowFrame.MAXIMIZED;
    this.updateCoordinates();
    this.setMinMaxButtons();
    
    if(wasMinimized) this.contentOnlyShown();
}


/** This method ends a move action. 
 * @private */
hax.visiui.WindowFrame.prototype.setMinMaxButtons = function() {
    if(this.minimizeButton) {
        if(this.windowState == hax.visiui.WindowFrame.MINIMIZED) {
            this.minimizeButton.style.display = "none";
        }
        else {
            this.minimizeButton.style.display = "";
        }
    }
    if(this.restoreButton) {
        if(this.windowState == hax.visiui.WindowFrame.NORMAL) {
            this.restoreButton.style.display = "none";
        }
        else {
            this.restoreButton.style.display = "";
        }
    }
    if(this.maximizeButton) {
        if(this.windowState == hax.visiui.WindowFrame.MAXIMIZED) {
            this.maximizeButton.style.display = "none";
        }
        else {
            this.maximizeButton.style.display = "";
        }
    }
}

/** @private */
hax.visiui.WindowFrame.prototype.updateCoordinates = function() {
	
    if(this.windowState === hax.visiui.WindowFrame.MAXIMIZED) {
        //apply the maximized coordinates size
        this.frame.style.left = "0px";
		this.frame.style.top = "0px";
		this.frame.style.height = "100%";
		this.frame.style.width = "100%";
    }
    else if(this.windowState === hax.visiui.WindowFrame.NORMAL) {
        //apply the normal size to the window
		this.frame.style.left = this.coordinateInfo.x + "px";
        this.frame.style.top = this.coordinateInfo.y + "px";
		if(this.coordinateInfo.height !== undefined) {
			this.frame.style.height = this.coordinateInfo.height + "px";
		}
		else {
			this.frame.style.height = hax.visiui.WindowFrame.DEFAULT_WINDOW_HEIGHT + "px";
		}
		if(this.coordinateInfo.width !== undefined) {
			this.frame.style.width = this.coordinateInfo.width + "px";
		}
		else {
			this.frame.style.width = hax.visiui.WindowFrame.DEFAULT_WINDOW_WIDTH + "px";
		}
    }
    else if(this.windowState === hax.visiui.WindowFrame.MINIMIZED) {
        //apply the minimized size to the window
		this.frame.style.left = this.coordinateInfo.x + "px";
        this.frame.style.top = this.coordinateInfo.y + "px";
		
		this.frame.style.height = "0px";
		this.frame.style.width = "0px";
    }
}

/** This method should be called when the entire window is shown.
 * @private */
hax.visiui.WindowFrame.prototype.frameShown = function() {
    
    //dispatch event
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_SHOWN,this);
}

/** This method should be called when the entire window is hidden.
 * @private */
hax.visiui.WindowFrame.prototype.frameHidden = function() {
    
    //dispatch event
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_HIDDEN,this);
}

/** This method should be called when the entire window is hidden
 * @private */
hax.visiui.WindowFrame.prototype.contentOnlyShown = function() {
    
    //dispatch event
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_SHOWN,this);
}

/** This method shoudl be called when the window contents are show
 * @private */
hax.visiui.WindowFrame.prototype.contentOnlyHidden = function() {
    
    //dispatch event
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_HIDDEN,this);
}

//====================================
// Initialization Methods
//====================================

/** @private */
hax.visiui.WindowFrame.prototype.initUI = function() {
    
    var table;
    var row;
    var cell;
    
    table = document.createElement("table");
    table.className = "visiui_win_main";
    this.frame = table; 
    
    //top border
    row = document.createElement("tr");
    table.appendChild(row);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_topLeft";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_WEST | hax.visiui.WindowFrame.RESIZE_NORTH);
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_top";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_NORTH);  
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_topRight";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_EAST | hax.visiui.WindowFrame.RESIZE_NORTH);  
    row.appendChild(cell);
    
    //title bar
    row = document.createElement("tr");
    table.appendChild(row);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_left";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_WEST); 
    cell.rowSpan = 3;
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass;
    this.titleBarCell = cell;
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_right";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_EAST); 
    cell.rowSpan = 3;
    row.appendChild(cell);
    
    //header row
    row = document.createElement("tr");
    table.appendChild(row);
    cell = document.createElement("td");
    cell.className = "visiui_win_headerCell";
    this.headerCell = cell;
    row.appendChild(cell);
    
    //body
    row = document.createElement("tr");
    row.className = "visiui_win_bodyRow";
    table.appendChild(row);
    cell = document.createElement("td");
    cell.className = "visiui_win_bodyCell";
    this.bodyCell = cell;
    row.appendChild(cell);
    
    //bottom border
    row = document.createElement("tr");
    table.appendChild(row);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_bottomLeft";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_WEST | hax.visiui.WindowFrame.RESIZE_SOUTH); 
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_bottom";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_SOUTH);  
    row.appendChild(cell);
    cell = document.createElement("td");
    cell.className = this.options.frameColorClass + " visiui_win_bottomRight";
    this.addResizeHandlers(cell,hax.visiui.WindowFrame.RESIZE_EAST | hax.visiui.WindowFrame.RESIZE_SOUTH);
    row.appendChild(cell);
    
    this.createTitleBar();
    this.createHeaderContainer();
    this.createBody();
}

/** @private */
hax.visiui.WindowFrame.prototype.addResizeHandlers = function(cell,flags) {
    //add handlers if the window is resizable
    if(this.options.resizable) {
        var instance = this;
        cell.onmousedown = function(event) {
            instance.resizeMouseDown(event,flags);
        }
        
        //these are not cel specific. they are used on all cells and on the parent container
        //during a move.
        if(!this.resizeOnMouseMove) {
            this.resizeOnMouseMove = function(event) {
                instance.resizeMouseMove(event);
            };
            this.resizeOnMouseUp = function(event) {
                instance.resizeMouseUp(event);
            };
            this.resizeOnMouseLeave = function(event) {
                instance.resizeMouseLeave(event);
            };
        }
    }
}

/** @private */
hax.visiui.WindowFrame.prototype.createTitleBar = function() {
    
    this.titleBar = document.createElement("div");
    this.titleBar.className = this.options.titleBarClass;

    //add elements
    this.titleBarLeftElements = document.createElement("div");
    hax.visiui.applyStyle(this.titleBarLeftElements,hax.visiui.WindowFrame.TITLE_BAR_LEFT_STYLE);
    this.titleBar.appendChild(this.titleBarLeftElements);


    this.titleBarRightElements = document.createElement("div");
    hax.visiui.applyStyle(this.titleBarRightElements,hax.visiui.WindowFrame.TITLE_BAR_RIGHT_STYLE);
    this.titleBar.appendChild(this.titleBarRightElements);

    //for handlers below
    var instance = this;
    
    //add window commands ( we will hide the bottons that are not needed)
    //minimize button
    if(this.options.minimizable) {
        this.minimizeButton = document.createElement("img");
        hax.visiui.applyStyle(this.minimizeButton,hax.visiui.WindowFrame.COMMAND_BUTTON_STYLE);
        this.minimizeButton.src = hax.visiui.WindowFrame.MINIMIZE_CMD_IMAGE;
        this.minimizeButton.onclick = function() {
            instance.minimizeContent();
        }
        this.titleBarRightElements.appendChild(this.minimizeButton);
    }
	
    //restore button - only if we cn minimize or maximize
    if(this.options.minimizable || this.options.maximizable) {	
        this.restoreButton = document.createElement("img");
        hax.visiui.applyStyle(this.restoreButton,hax.visiui.WindowFrame.COMMAND_BUTTON_STYLE);
        this.restoreButton.src = hax.visiui.WindowFrame.RESTORE_CMD_IMAGE;
        this.restoreButton.onclick = function() {
            instance.restoreContent();
        }
        this.titleBarRightElements.appendChild(this.restoreButton);
    }
    
    //maximize button and logic
    if(this.options.maximizable) {
        this.maximizeButton = document.createElement("img");
        hax.visiui.applyStyle(this.maximizeButton,hax.visiui.WindowFrame.COMMAND_BUTTON_STYLE);
        this.maximizeButton.src = hax.visiui.WindowFrame.MAXIMIZE_CMD_IMAGE;
        this.maximizeButton.onclick = function() {
            instance.maximizeContent();
        }
        this.titleBarRightElements.appendChild(this.maximizeButton);
    }
    
    //layout the window buttons
    this.windowState = hax.visiui.WindowFrame.NORMAL;
    this.setMinMaxButtons();
    
    //close button
    if(this.options.closable) {
        this.closeButton = document.createElement("img");
        hax.visiui.applyStyle(this.closeButton,hax.visiui.WindowFrame.COMMAND_BUTTON_STYLE);
        this.closeButton.src = hax.visiui.WindowFrame.CLOSE_CMD_IMAGE;
        this.closeButton.onclick = function() {
            instance.hide();
        }
        this.titleBarRightElements.appendChild(this.closeButton);
    }
	
	//add am empty title
	this.setTitle("");
    
    //mouse move and resize
    if(this.options.movable) {
        //add mouse handlers for moving the window 
        this.titleBar.onmousedown = function(event) {
            instance.moveMouseDown(event);
        }

        //mouse window drag events we will place on the parent container - since the mouse drag 
        //may leave the window frame during the move
        this.moveOnMouseMove = function(event) {
            instance.moveMouseMove(event);
        };
        this.moveOnMouseUp = function(event) {
            instance.moveMouseUp(event);
        }
        this.moveOnMouseLeave = function(event) {
            instance.moveMouseLeave(event);
        }
    }
    
    //add to window
    this.titleBarCell.appendChild(this.titleBar);
}

/** @private */
hax.visiui.WindowFrame.prototype.createHeaderContainer = function() {
    
    this.headerElement = document.createElement("div");
    this.headerElement.className = "visiui_win_header";
    
    this.headerCell.appendChild(this.headerElement);
 
    //load empty headers
    this.loadHeaders([]);
}
	
/** @private */
hax.visiui.WindowFrame.prototype.createBody = function() {
    
    this.body = document.createElement("div");
    this.body.className = "visiui_win_body";
    
    this.bodyCell.appendChild(this.body);
}
;
/** This is a minimal parent container. The resize, show and hide events must be 
 * externally managed.
 * 
 * @class 
 */
hax.visiui.SimpleParentContainer = function(div,initialIsShowing) {
    
    //base init
    hax.core.EventManager.init.call(this);
    hax.visiui.ParentContainer.init.call(this,div,this);
    
    this.isShowing = initialIsShowing;
}

//add components to this class
hax.core.util.mixin(hax.visiui.SimpleParentContainer,hax.core.EventManager);
hax.core.util.mixin(hax.visiui.SimpleParentContainer,hax.visiui.ParentContainer);

/** This method must be implemented in inheriting objects. */
hax.visiui.SimpleParentContainer.prototype.getContentIsShowing = function() {
    return this.isShowing;
}

/** This should be called when the element is shown. */
hax.visiui.SimpleParentContainer.prototype.isShown = function() {
    this.isShowing = true;
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_SHOWN,this);
}

/** This should be called when the element is hidden. */
hax.visiui.SimpleParentContainer.prototype.isHidden = function() {
    this.isShowing = false;
    this.dispatchEvent(hax.visiui.ParentContainer.CONTENT_HIDDEN,this);
};
/** This is a tab frame. The constructor takes an id for the container and
 * an options object. The tab frame wil lbe appended to the given container.
 * 
 * This is not really a general window element. It is made to fit this use case.
 * It resizes to occupy all space in the parent, starting form its existing location,
 * which in this case should be right after the menu.
 * 
 * note - document external color classes set in options
 * 
 * options: none
 * 
 * @class 
 */
hax.visiui.TabFrame = function(parentDiv,options) {
	
    if(!options) {
        options = {};
    }
    
    //make sure these are passed in with valid colors!
    if((!options.tabBarColorClass)||(!options.activeTabColorClass)) {
        alert("The tabBarColorClass and  activeTabColorClass must be set in the options for tab frame!");
    } options.titleBarClass = "";
  
    
    //base init
    hax.core.EventManager.init.call(this);
    //initialize parent container after conatiner div created
	
    //variables
    this.options = options;
    this.tabTable = {};
    this.activeTab = null;
    
    this.tabFrameControl = document.createElement("div");
    hax.visiui.applyStyle(this.tabFrameControl,hax.visiui.TabFrame.CONTAINER_STYLE);
    parentDiv.appendChild(this.tabFrameControl);
	
    this.tabFrame = document.createElement("div");
    hax.visiui.applyStyle(this.tabFrame,hax.visiui.TabFrame.DISPLAY_FRAME_STYLE);
	this.tabFrameControl.appendChild(this.tabFrame);  
    
    this.tabBar = document.createElement("div");
    hax.visiui.applyStyle(this.tabBar,hax.visiui.TabFrame.TAB_BAR_STYLE);
    this.tabBar.className = this.options.tabBarColorClass;
    this.tabFrameControl.appendChild(this.tabBar);
    
    //base init for parent continer mixin
    hax.visiui.ParentContainer.init.call(this,this.tabFrame,this);	
}

//add components to this class
hax.core.util.mixin(hax.visiui.TabFrame,hax.core.EventManager);
hax.core.util.mixin(hax.visiui.TabFrame,hax.visiui.ParentContainer);

//events
hax.visiui.TabFrame.TAB_SHOWN = "tabShown";
hax.visiui.TabFrame.TABS_RESIZED = "tabsResized";

hax.visiui.TabFrame.CONTAINER_FRAME_MARGIN_PX = 5;

hax.visiui.TabFrame.CONTAINER_STYLE = {
    "position":"relative",
    "display":"table",
    "width":"100%",
    "height":"100%",
    "top":"0px",
    "left":"0px",
};
hax.visiui.TabFrame.DISPLAY_FRAME_STYLE = {
    //fixed
    "position":"relative",
    "display":"table-row",
    "width":"100%",
    "height":"100%",
    "top":"0px",
    "left":"0px",
    
    //configurable
    "backgroundColor":"white",
    //"border":" 1px solid gray",
    "borderBottomWidth":" 0px"
}
hax.visiui.TabFrame.TAB_BAR_STYLE = {
    //fixed
    "position":"relative",
    "display":"table-row",
    "width":"100%",
    
    /* set background color with an external style */
    "margin":"0px",
    "border":" 1px solid gray",
    "borderTopWidth":" 0px"
}
hax.visiui.TabFrame.TAB_BASE_STYLE = {
    //fixed
    "display":"inline-block",
    "cursor":" default",
    
    //configurable
    "border":" 1px solid black",
    "padding":"2px"
}
hax.visiui.TabFrame.TAB_INACTIVE_STYLE = {
    //fixed
    "display":"inline-block",
    "cursor":" default",
    
    /* set color with external class */
    "border":" 1px solid black",
    "borderTopColor":"",
    "padding":"2px"
}
hax.visiui.TabFrame.TAB_ACTIVE_STYLE = {
    //fixed
    "display":"inline-block",
    "cursor":" default",
    
    /* set background color with an external style */
    "border":" 1px solid black",
    "borderTopColor":"white",
    "padding":"2px"
}

/** This method returns the dom element for the control. */
hax.visiui.TabFrame.prototype.getElement = function() {
    return this.tabFrameControl;
}

/** This method returns the main dom element for the window frame. */
hax.visiui.TabFrame.prototype.getTab = function(name) {
    var tabData = this.tabTable[name];
    if(tabData) {
        return tabData.tabDisplay;
    }
    else {
        return null;
    }
}

/** This method adds a tab to the tab frame. */
hax.visiui.TabFrame.prototype.addTab = function(name) {
    //make sure there is no tab with this name
    if(this.tabTable[name]) {
        alert("There is already a tab with this name!");
        return null;
    }
    
    //create the tab object
    var tab = new hax.visiui.Tab(name, this);
    this.tabFrame.appendChild(tab.getContainerElement());
    
    //create tab label
    var tabLabelElement = document.createElement("div");
    hax.visiui.applyStyle(tabLabelElement,hax.visiui.TabFrame.TAB_BASE_STYLE);
    tabLabelElement.innerHTML = name;
    this.tabBar.appendChild(tabLabelElement);
	
    //add the click handler
    var instance = this;
    tabLabelElement.onclick = function() {
        instance.setActiveTab(name);
    }
    tabLabelElement.onmousedown = function(e) {
        //this prevents text selection
        e.preventDefault();
    }
	
    //add to tabs
    var tabData = {};
    tabData.tabDisplay = tab;
    tabData.tabLabel = tabLabelElement;
    
    this.tabTable[name] = tabData;
    if(this.activeTab == null) {
        this.activeTab = name;
    }
    this.updateTabDisplay();
    
//    //resize the main control element
//    this.resizeElement();
    
    return tab;
}

/** This method adds a tab to the tab frame. */
hax.visiui.TabFrame.prototype.removeTab = function(name) {
    var tabData = this.tabTable[name];
    if(tabData) {
        this.tabFrame.removeChild(tabData.tabDisplay.getContainerElement());
        this.tabBar.removeChild(tabData.tabLabel);
        delete this.tabTable[name];
		
        if(this.activeTab == name) {
            this.activeTab = null;
            //choose a random tab
            for(var title in this.tabTable) {
                this.activeTab = title;
                break;
            }
        }
        this.updateTabDisplay();
    }
}

/** This mesets the active tab, by tab title. */
hax.visiui.TabFrame.prototype.setActiveTab = function(title) {
    this.activeTab = title;
    this.updateTabDisplay();
}

/** This mesets the active tab, by tab title. */
hax.visiui.TabFrame.prototype.getActiveTabTitle = function() {
    return this.activeTab;
}

/** This updates the tabs. */
hax.visiui.TabFrame.prototype.updateTabDisplay = function() {
    var title;
    for(title in this.tabTable) {
        var tabData = this.tabTable[title];
        if(title == this.activeTab) {
            tabData.tabDisplay.getContainerElement().style.display = "";
            hax.visiui.applyStyle(tabData.tabLabel,hax.visiui.TabFrame.TAB_ACTIVE_STYLE);
            tabData.tabLabel.className = this.options.activeTabColorClass;
            this.dispatchEvent(hax.visiui.TabFrame.TAB_SHOWN,this.activeTab);
        }
        else {
            tabData.tabDisplay.getContainerElement().style.display = "none";
            hax.visiui.applyStyle(tabData.tabLabel,hax.visiui.TabFrame.TAB_INACTIVE_STYLE);
            tabData.tabLabel.className = this.options.tabBarColorClass;
        }
    }
}
;

hax.visiui.Tab = function(name, tabFrame) {
    
    //create the tab element
    var element = document.createElement("div");

    //base init
    hax.core.EventManager.init.call(this);
    hax.visiui.ParentContainer.init.call(this,element,this);
	hax.visiui.ParentHighlighter.init.call(this,element);
    
    this.name = name;
    this.isShowing = false;
    
    hax.visiui.applyStyle(element,hax.visiui.Tab.TAB_WINDOW_STYLE);
	this.displayFrame = element;
    
    //add handlers for resize and show
    var instance = this;
    tabFrame.addListener(hax.visiui.TabFrame.TABS_RESIZED, function() {  
        instance.dispatchEvent(hax.visiui.WindowFrame.RESIZED,this);
    });
    tabFrame.addListener(hax.visiui.TabFrame.TAB_SHOWN, function(activeTabName) {
        if(activeTabName == instance.name) {
            instance.isShowing = true;
            instance.dispatchEvent(hax.visiui.ParentContainer.CONTENT_SHOWN,instance);
        }
        else {
            instance.isShowing = false;
            instance.dispatchEvent(hax.visiui.ParentContainer.CONTENT_HIDDEN,instance);
        }
    });
    
    
}

//add components to this class
hax.core.util.mixin(hax.visiui.Tab,hax.core.EventManager);
hax.core.util.mixin(hax.visiui.Tab,hax.visiui.ParentContainer);
hax.core.util.mixin(hax.visiui.Tab,hax.visiui.ParentHighlighter);

hax.visiui.Tab.TAB_WINDOW_STYLE = {
    "top":"0px",
    "left":"0px",
	"height":"100%",
    "position":"relative",
    "backgroundColor":"white",
    "overflow":"auto"
}

/** This method must be implemented in inheriting objects. */
hax.visiui.Tab.prototype.getContentIsShowing = function() {
    return this.isShowing;
};
/** Thiis is a namespace with functions to control menu operation
 *
 * @class 
 */
hax.visiui.Menu = {};

hax.visiui.Menu.initialized = false;
hax.visiui.Menu.activeMenu = null;

/** This method creates a static menu with the given text. */
hax.visiui.Menu.createMenu = function(text) {
    var element = document.createElement("div");
    element.innerHTML = text;
    return new hax.visiui.MenuHeader(element);
}

/** This method creates a static menu from the given img url. */
hax.visiui.Menu.createMenuFromImage = function(imageUrl) {
    var imageElement = document.createElement("img");
    imageElement.src = imageUrl;
    var element = document.createElement("div");
    element.appendChild(imageElement);
    return new hax.visiui.MenuHeader(element);
}

hax.visiui.Menu.showContextMenu = function(menuBody,contextEvent) {
    //create menu and attach to document body
    menuBody.setPosition(contextEvent.clientX, contextEvent.clientY, document.body);
    //cacnel default popup
    contextEvent.preventDefault();
    //show
    hax.visiui.Menu.show(menuBody);
}

hax.visiui.Menu.menuHeaderPressed = function(menuHeader) {
	//if there is an active menu, pressing the header closes the active menu otherwise show the menu
	if(hax.visiui.Menu.activeMenu) {
		//active menu - close the menu
		hax.visiui.Menu.hideActiveMenu();
	}
	else {
		//no active menu, open this menu
		hax.visiui.Menu.show(menuHeader.getMenuBody());
	}
}

hax.visiui.Menu.menuHeaderEntered = function(menuHeader) {
	//if a header is entered and there is an active, non-context menu, open this menu
	if((hax.visiui.Menu.activeMenu)&&(!hax.visiui.Menu.activeMenu.getIsContext())) {
		hax.visiui.Menu.show(menuHeader.getMenuBody());
	}
}

hax.visiui.Menu.nonMenuPressed = function() {
	//if the mouse is pressed outside the menu, close any active menu
	if(hax.visiui.Menu.activeMenu) {
		hax.visiui.Menu.hideActiveMenu();
	}
}

//================================
// Internal
//================================

hax.visiui.Menu.show = function(menuBody) {
	if(hax.visiui.Menu.activeMenu) {
		hax.visiui.Menu.hideActiveMenu();
	}
	var parentElement = menuBody.getParentElement();
    var menuElement = menuBody.getMenuElement();
    if((parentElement)&&(menuElement)) {
        parentElement.appendChild(menuElement);
        hax.visiui.Menu.activeMenu = menuBody;
    }
}

hax.visiui.Menu.hideActiveMenu = function() {
	if(hax.visiui.Menu.activeMenu) {
        var parentElement = hax.visiui.Menu.activeMenu.getParentElement();
        var menuElement = hax.visiui.Menu.activeMenu.getMenuElement();
        var menuHeader = hax.visiui.Menu.activeMenu.getMenuHeader();
        if((parentElement)&&(menuElement)) {
            parentElement.removeChild(menuElement);
            hax.visiui.Menu.activeMenu = null;
        }	
        if(menuHeader) {
            menuHeader.restoreNormalAppearance();
        }
	}
}

hax.visiui.Menu.nonMenuMouseHandler = null;

hax.visiui.Menu.initialize = function() {
	window.addEventListener("mousedown",hax.visiui.Menu.nonMenuPressed);
	hax.visiui.Menu.initialized = true;
}

/** This method allows you to undo the initialization actions. I am not sure you would ever need to do it. */
hax.visiui.Menu.deinitialize = function() {
	window.removeEventListener("mousedown",hax.visiui.Menu.nonMenuPressed);
	hax.visiui.Menu.initialized = false;
}
	;
/** This is a menu component, attached to the given dom element
 *
 * @class 
 */
hax.visiui.MenuHeader = function(domElement) {
	
	//initialize menus, if needed
	if(!hax.visiui.Menu.initialized) {
		hax.visiui.Menu.initialize();
	}
	
    //variables
    this.domElement = domElement;
    this.menuBody = new hax.visiui.MenuBody();
	
    //construct the menu
	this.initHeadingElement();
    
    //attach menu to heading
    this.menuBody.attachToMenuHeader(this);
}

//style info
hax.visiui.MenuHeader.MENU_HEADING_BASE_STYLE = {
    //fixed
    "display":"inline-block",
    "position":"relative",
    "cursor":" default",
	"overflow":"visible"
}
hax.visiui.MenuHeader.MENU_HEADING_NORMAL_STYLE = {
    //configurable
    "border":"",
    "backgroundColor":"",
    "padding":"2px"
}
hax.visiui.MenuHeader.MENU_HEADING_HOVER_STYLE = {
    //configurable
    "backgroundColor":"lightgray",
    "padding":"2px"
}

/** this returns the dom element for the menu heading. */
hax.visiui.MenuHeader.prototype.getElement = function() {
    return this.domElement;
}

/** this returns the dom element for the menu object. */
hax.visiui.MenuHeader.prototype.getMenuBody = function() {
    return this.menuBody;
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.addEventMenuItem = function(title, eventName, eventData, eventManager) {
    this.menuBody.addEventMenuItem(title,eventName, eventData, eventManager);
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.addCallbackMenuItem = function(title, callback) {
    this.menuBody.addCallbackMenuItem(title,callback);
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.addMenuItem = function(itemInfo) {
    this.menuBody.addMenuItem(itemInfo);
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.setMenuItems = function(itemInfos) {
    this.menuBody.setMenuItems(itemInfos);
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.removeMenuItem = function(title) {
	this.menuBody.removeMenuItem(title);
}

//================================
// Init
//================================

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.initHeadingElement = function() {
    hax.visiui.applyStyle(this.domElement,hax.visiui.MenuHeader.MENU_HEADING_BASE_STYLE);
    hax.visiui.applyStyle(this.domElement,hax.visiui.MenuHeader.MENU_HEADING_NORMAL_STYLE);
	
    var instance = this;
    this.domElement.onmousedown = function(e) {
        hax.visiui.Menu.menuHeaderPressed(instance);
		e.stopPropagation();
    }	
	
    this.domElement.onmouseenter = function(e) {
		hax.visiui.applyStyle(instance.domElement,hax.visiui.MenuHeader.MENU_HEADING_HOVER_STYLE);
        hax.visiui.Menu.menuHeaderEntered(instance);
    }
	this.domElement.onmouseleave = function(e) {
        hax.visiui.applyStyle(instance.domElement,hax.visiui.MenuHeader.MENU_HEADING_NORMAL_STYLE);
    }
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuHeader.prototype.restoreNormalAppearance = function() {
    hax.visiui.applyStyle(this.domElement,hax.visiui.MenuHeader.MENU_HEADING_NORMAL_STYLE);
}
;
/** This is a menu component
 *
 * @class 
 */
hax.visiui.MenuBody = function() {
	
	//initialize menus, if needed
	if(!hax.visiui.Menu.initialized) {
		hax.visiui.Menu.initialize();
	}
	
    //variables
    this.menuDiv = null;
    this.parentElement = null;
	
    this.menuItems = {};
	
    //construct the menu
    this.createMenuElement();
    
    //this will be set if it is a static menu
    this.menuHeader = null;
}

//style info
hax.visiui.MenuBody.MENU_STYLE = {
    //fixed
    "overflow":"visible",
    "position":"absolute",
    "top":"100%",
    "left":"0%",
    "zIndex":"2000",
    
    //configurable
    "border":"1px solid lightgray",
    "backgroundColor":"white"
}
hax.visiui.MenuBody.MENU_ITEM_BASE_STYLE = {
    //fixed
    "cursor":"default",
    "display":"table"
}
hax.visiui.MenuBody.MENU_ITEM_NORMAL_STYLE = {
    //configurable
    "backgroundColor":"",
    "padding":"2px"
}
hax.visiui.MenuBody.MENU_ITEM_HOVER_STYLE = {
    //configurable
    "backgroundColor":"lightgray",
    "padding":"2px"
}

/** This method replaces on spaces with &nbsp; spaces. It is intedned to prevent
 * wrapping in html. */
hax.visiui.MenuBody.convertSpacesForHtml = function(text) {
    return text.replace(/ /g,"&nbsp;");
}


/** this returns the dom element for the menu object. */
hax.visiui.MenuBody.prototype.getMenuElement = function() {
    return this.menuDiv;
}

/** This returns the parent element for the menu.  */
hax.visiui.MenuBody.prototype.getParentElement = function() {
    return this.parentElement;
}

/** This returns the parent element for the menu.  */
hax.visiui.MenuBody.prototype.getMenuHeader = function() {
    return this.menuHeader;
}

/** This returns the parent element for the menu.  */
hax.visiui.MenuBody.prototype.getIsContext = function() {
    return (this.menuHeader == null);
}

/** This method is used to attach the menu to the menu head, in a static menu. */
hax.visiui.MenuBody.prototype.attachToMenuHeader = function(menuHeader) {
    //attach menu to heading
    this.parentElement = menuHeader.getElement();
    this.menuDiv.style.left = "0%";
    this.menuDiv.style.top = "100%";
    
    this.menuHeader = menuHeader;
}

/** This method is used to set the position for a context menu. The x and y coordinates
 * should be the coordinates in the parent element. It is recommended to use the 
 * document body. */
hax.visiui.MenuBody.prototype.setPosition = function(x, y, parentElement) {
    this.parentElement = parentElement;
   
//we need to calculate the size, so I add and remove it - there is probably another way
parentElement.appendChild(this.menuDiv);
    var parentWidth = parentElement.offsetWidth;
    var parentHeight = parentElement.offsetHeight;
    var menuWidth = this.menuDiv.clientWidth;
    var menuHeight = this.menuDiv.clientHeight;
parentElement.appendChild(this.menuDiv);

    //position
    if((x + menuWidth > parentWidth)&&(x > parentWidth/2)) {
        this.menuDiv.style.left = (x - menuWidth) + "px";
    }
    else {
        this.menuDiv.style.left = x + "px";
    }
    if((y + menuHeight > parentHeight)&&(y > parentHeight/2)) {
        this.menuDiv.style.top = (y - menuHeight) + "px";
    }
    else {
        this.menuDiv.style.top = y + "px";
    }
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuBody.prototype.addEventMenuItem = function(title, eventName, eventData, eventManager) {
    var itemInfo = {};
    itemInfo.title = title;
    itemInfo.eventName = eventName;
    itemInfo.eventData = eventData;
    itemInfo.eventManager = eventManager;
    this.addMenuItem(itemInfo);
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuBody.prototype.addCallbackMenuItem = function(title, callback) {
    var itemInfo = {};
    itemInfo.title = title;
    itemInfo.callback = callback;
    this.addMenuItem(itemInfo);
}
    
/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuBody.prototype.addMenuItem = function(itemInfo) {
    itemInfo.element = document.createElement("div");
    hax.visiui.applyStyle(itemInfo.element,hax.visiui.MenuBody.MENU_ITEM_NORMAL_STYLE);
    
    var title = hax.visiui.MenuBody.convertSpacesForHtml(itemInfo.title);
    itemInfo.element.innerHTML = title;
	
    itemInfo.element.onmousedown = function(event) {
		event.stopPropagation();
    }
	itemInfo.element.onmouseup = function(event) {
		//close menu
		hax.visiui.Menu.hideActiveMenu();
        
        //do menu action
        if(itemInfo.eventName) {
            //dispatch event
            itemInfo.eventManager.dispatchEvent(itemInfo.eventName,itemInfo.eventData);
        }
        else if(itemInfo.callback) {
            //use the callback
            itemInfo.callback();
        }
        event.stopPropagation();
        hax.visiui.applyStyle(itemInfo.element,hax.visiui.MenuBody.MENU_ITEM_NORMAL_STYLE);
    }
	//css hover did not work with drag
	itemInfo.element.onmouseenter= function(e) {
        hax.visiui.applyStyle(itemInfo.element,hax.visiui.MenuBody.MENU_ITEM_HOVER_STYLE);
    }
	itemInfo.element.onmouseleave= function(e) {
        hax.visiui.applyStyle(itemInfo.element,hax.visiui.MenuBody.MENU_ITEM_NORMAL_STYLE);
    }
	
    this.menuDiv.appendChild(itemInfo.element);
    this.menuItems[itemInfo.title] = itemInfo;
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuBody.prototype.setMenuItems = function(itemInfos) {
    for(var i = 0; i < itemInfos.length; i++) {
        this.addMenuItem(itemInfos[i]);
    }
}

/** this adds a menu item that dispatchs the given event when clicked. */
hax.visiui.MenuBody.prototype.removeMenuItem = function(title) {
    var itemInfo = this.menuItems[title];
    if(itemInfo) {
        this.menuDiv.removeChild(itemInfo.element);
        delete this.menuItems[title];
    }
}

//================================
// Init
//================================

/** This method creates the menu body that is shown below the header. */
hax.visiui.MenuBody.prototype.createMenuElement = function() {
    this.menuDiv = document.createElement("div");

    //style like a normal manu
    hax.visiui.applyStyle(this.menuDiv,hax.visiui.MenuBody.MENU_STYLE);
}
;
hax.jsonedit = {};

var OBJECT_CONSTRUCTOR = {}.constructor;
var ARRAY_CONSTRUCTOR = [].constructor;
var STRING_CONSTRUCTOR = "".constructor;
var NUMBER_CONSTRUCTOR = (0).constructor;
var BOOLEAN_CONSTRUCTOR = (true).constructor;

//inputs to this should be "object", "array" or "value". Other type objects will not be processed properly
hax.jsonedit.getObjectType = function(data) {
	if(data == null) return "value";
	
	if(data.constructor == OBJECT_CONSTRUCTOR) {
		return "object";
	}
	else if(data.constructor == ARRAY_CONSTRUCTOR) {
		return "array";
	}
	else {
		return "value";
	}
}

//this tells a type value: "string", "number", "boolean", "other", "null"
hax.jsonedit.getValueType = function(value) {
	if(value == null) return "null";
	
	if(value.constructor == STRING_CONSTRUCTOR) {
		return "string";
	}
	else if(value.constructor == NUMBER_CONSTRUCTOR) {
		return "number";
	}
	else if(value.constructor == BOOLEAN_CONSTRUCTOR) {
		return "boolean";
	}
	else {
		return "other";
	}
}

hax.jsonedit.isBoolString = function(stringValue) {
    return (stringValue === "false" || stringValue === "true");
}

hax.jsonedit.isNullString = function(stringValue) {
    return (stringValue === "null");
}

//This method retuns true if the stringToNonString method will successfully convet the object.
hax.jsonedit.canBeConvertedToNonString = function(stringValue) {
	return(isFinite(stringValue) || hax.jsonedit.isBoolString(stringValue) || hax.jsonedit.isNullString(stringValue) );
}

//This method coverts a string value to non-string value (currently a number or boolean). 
//If the conversion fails, it returns the string value.
//before the method is called it should be checked that it is a valid
//number or boolean.
hax.jsonedit.stringToNonString = function(stringValue) {
	var stringToValueCode = "value = " + stringValue;
	var value;
	try {
	  eval(stringToValueCode);
	  return value;
	}
	catch(error) {
	  return stringValue;
	}
}

var PIXELS_PER_INDENT = 10;
hax.jsonedit.createIndentElement = function(indentLevel) {
	var cell = document.createElement("div");
	cell.className = "indentCell";
	cell.style.width = (PIXELS_PER_INDENT * indentLevel) + "px";
	return cell;
}

hax.jsonedit.createObjectDelimiter = function(delimiter) {
	var cell = document.createElement("div");
	cell.className = "objectDelimCell";
	cell.innerHTML = delimiter;
	return cell;
}
hax.jsonedit.createExpandButton = function(valueEntry) {
	var cell = document.createElement("div");
	cell.className = "buttonCell";
	cell.innerHTML = "+";
	cell.onclick = function() {
		valueEntry.setExpanded(true);
	}
	return cell;
}
hax.jsonedit.createContractButton = function(valueEntry) {
	var cell = document.createElement("div");
	cell.className = "buttonCell";
	cell.innerHTML = "-";
	cell.onclick = function() {
		valueEntry.setExpanded(false);
	}
	return cell;
}


;
/** Constructor */
hax.jsonedit.KeyEntry = function(editArea,parentValue,key,keyType,data,isEditable,isVirtual) {
    this.editArea = editArea;
	this.key = key;
	this.type = keyType; //hax.jsonedit.EditField.FIELD_TYPE_KEY ro hax.jsonedit.EditField.FIELD_TYPE_INDEX
	this.data = data;
	this.isEditable = isEditable;
	this.indentLevel = parentValue.getIndentLevel() + 1;
    this.parentValue = parentValue;
    
    //thse are for virtual key entries
    this.isVirtual = isVirtual;
	this.body = null;
    
    //this is the edit control for the key
    this.keyEditObject = null;
    
    this.valueEntry = null;
	
	this.createBody(this.data);
}

//=======================
// Accessors
//=======================

hax.jsonedit.KeyEntry.prototype.setKey = function(key) {
	this.key = key;
    this.keyEditObject.setValue(key);
}

hax.jsonedit.KeyEntry.prototype.getInitialKey = function() {
	return this.key;
}

hax.jsonedit.KeyEntry.prototype.getCurrentKey = function() {
	return this.keyEditObject.getValue();
}

hax.jsonedit.KeyEntry.prototype.getCurrentValue = function() {
	return this.valueEntry.getCurrentValue();
}

hax.jsonedit.KeyEntry.prototype.getElement = function() {
	return this.body;
}

hax.jsonedit.KeyEntry.prototype.getParentValueObject = function() {
	return this.parentValue;
}

hax.jsonedit.KeyEntry.prototype.getIndentLevel = function() {
	return this.indentLevel;
}

hax.jsonedit.KeyEntry.prototype.setIsVirtual = function(isVirtual) {
	this.isVirtual = isVirtual;
	this.keyEditObject.setIsVirtual(isVirtual);

    this.valueEntry.setIsVirtual(isVirtual);
}

hax.jsonedit.KeyEntry.prototype.updateValueElements = function() {
    //remove all from element
	hax.core.util.removeAllChildren(this.body);
    //recreate
    this.formatBody();
}

//=================================
// Others Methods
//=================================

/** This method created the key entry, clearing the old one if applicable.
 * @private */
hax.jsonedit.KeyEntry.prototype.createBody = function(entryData) {
	
	//create main row
	//create row div
	this.body = document.createElement("div");
	this.body.className = "jsonBody";
    
    //create the key
    this.createKeyElement();
    
    //create value entry
	this.valueEntry = new hax.jsonedit.ValueEntry(this.editArea,this,entryData,this.isEditable,this.isVirtual);
	
    this.formatBody();
}

/** @private */
hax.jsonedit.KeyEntry.prototype.formatBody = function() {
	//add indent
	this.body.appendChild(hax.jsonedit.createIndentElement(this.indentLevel));
	
	//add key
	this.body.appendChild(this.keyEditObject.getElement());
	
    //add the value elements
	var valueElementList = this.valueEntry.getElementList();
    for(var i = 0; i < valueElementList.length; i++) {
        this.body.appendChild(valueElementList[i]);
    }
}

/** This wraps the list elements into the proper format. 
* @private */
hax.jsonedit.KeyEntry.prototype.createKeyElement = function() {
    
	var isEditable = (this.type === hax.jsonedit.EditField.FIELD_TYPE_KEY) ? this.isEditable : false;
	
    this.keyEditObject = new hax.jsonedit.EditField(this.key,this.type,isEditable,this.isVirtual);
    
    //make the edit field editable if it is a key
    if(isEditable) {
        var instance = this;
        var onEdit = function(editValue) {
            if(instance.isVirtual) {
                instance.parentValue.makeVirtualEntryReal();
            }
            
            //notify of edit
            instance.editArea.valueEdited();
        }
        this.keyEditObject.setOnEditCallback(onEdit);
        
        //set the navgation callback
        var navCallback = function(direction) {
            instance.navigateCells(direction);
        }
        this.keyEditObject.setNavCallback(navCallback);
    }
}

//navigation rules
hax.jsonedit.KeyEntry.prototype.navigateCells = function(direction) {
    if(this.parentValue) {
        this.parentValue.navigateChildren(this,true,direction);
    }
}

/** This loads the context menu for the key. It should be update if
 *the key index changes. */
hax.jsonedit.KeyEntry.prototype.loadContextMenu = function(parentKeyCount,keyIndex) {

    var instance = this;
    var parentValue = this.parentValue; 
    var element = this.keyEditObject.getElement();
    var valueEntry = this.valueEntry;
    var valueType = valueEntry.getType();
    var isVirtual = this.isVirtual;
    
    element.oncontextmenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
		
		//for now no context menu if nto editable
		if(!instance.isEditable) return;
        
        var contextMenu = new hax.visiui.MenuBody();
        
        if(!isVirtual) {
            //insert elements
            contextMenu.addCallbackMenuItem("Insert Above",function() {parentValue.insertElement("","",keyIndex);});
            contextMenu.addCallbackMenuItem("Insert Below",function() {parentValue.insertElement("","",keyIndex+1);});

            if(keyIndex > 0) {
                contextMenu.addCallbackMenuItem("Move Up",function() {parentValue.moveChildKeyToNextIndex(keyIndex-1);});
            }
            if(keyIndex < parentKeyCount - 1) {
                contextMenu.addCallbackMenuItem("Move Down",function() {parentValue.moveChildKeyToNextIndex(keyIndex);});
            }

            //delete elements
            if(!instance.isVirtual) {
                contextMenu.addCallbackMenuItem("Delete Entry",function() {parentValue.deleteChildElement(instance);});
            }

            //conversions
            if(valueType == "value") {
                contextMenu.addCallbackMenuItem("Convert To Object",function() {valueEntry.valueToObject()});
                contextMenu.addCallbackMenuItem("Convert To Array",function() {valueEntry.valueToArray()});

                if(valueEntry.convertibleToNumber()) {
                    contextMenu.addCallbackMenuItem("Convert To Number",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToBool()) {
                    contextMenu.addCallbackMenuItem("Convert To Boolean",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToNull()) {
                    contextMenu.addCallbackMenuItem("Convert To Null",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToString()) {
                    contextMenu.addCallbackMenuItem("Convert To String",function() {valueEntry.valueToString()});
                }
            }
            else if(valueType == "object") {
                contextMenu.addCallbackMenuItem("Convert To Value",function() {valueEntry.convertToValue()});
                contextMenu.addCallbackMenuItem("Convert To Array",function() {valueEntry.objectToArray()});
            }
            else if(valueType == "array") {
                contextMenu.addCallbackMenuItem("Convert To Value",function() {valueEntry.convertToValue()});
                contextMenu.addCallbackMenuItem("Convert To Object",function() {valueEntry.arrayToObject()});
            }
        }
        
        hax.visiui.Menu.showContextMenu(contextMenu,event);
    }
    
    //if this is a value entry, set the same context menu on the value element
    if(valueType == "value") {
        var valueEditObject = this.valueEntry.getValueEditObject();
        valueEditObject.getElement().oncontextmenu = element.oncontextmenu;
    }
  
}

//======================================
// Actions
//======================================

hax.jsonedit.KeyEntry.prototype.convertToKeyType = function(key) {
    if(this.type == hax.jsonedit.EditField.FIELD_TYPE_KEY) return;
    
    this.type = hax.jsonedit.EditField.FIELD_TYPE_KEY;
    this.key = String(key);
    
    //create the key
    this.createKeyElement();
    
    //remove and reset all from element
	hax.core.util.removeAllChildren(this.body);
    this.formatBody();
}

hax.jsonedit.KeyEntry.prototype.convertToIndexType = function(index) {
    if(this.type == hax.jsonedit.EditField.FIELD_TYPE_INDEX) return;
    
    this.type = hax.jsonedit.EditField.FIELD_TYPE_INDEX;
    this.key = index;
    
    //create the key
    this.createKeyElement();
    
    //remove and reset all from element
    hax.core.util.removeAllChildren(this.body);
    this.formatBody();
}


;
/**  This a value entry
 * 
 * notes:
 * - parent is the object that holds the dom elements for this value. it will be
 * either the key for this value or the top level entry. It should have a method
 * "updateValueElements" that will refresh the elements if they have been updated.
 */
hax.jsonedit.ValueEntry = function(editArea,parent,data,isEditable,isVirtual) {
    this.editArea = editArea;
	this.parent = parent;
    this.data = data;
	this.isEditable = isEditable;
	this.type = hax.jsonedit.getObjectType(data); //"value", "object", "array"

	this.indentLevel = parent.getIndentLevel() + 1;
    
    //these are all the display elements
    this.elementList = [];
    
    //thse are for virtual key entries
    this.isVirtual = isVirtual;
    
    //for value types ---
    
    //these are the edit elements
    this.valueEditObject = null;
    
    //---------------------
    
    //for list types ----
	
	//these are the child keys
    this.childKeyEntries = [];
    
    //this is the virtual child key
    this.virtualChildKey = null;
	
    //this is the singel element for the list entries (if applicable)
	this.listDiv = null;
    
    //this is used to control expanding and collapsing
    this.isExpanded = true;
	this.expandedList = [];
	this.contractedList = [];
    
    //-------------------
    
    if(this.type == "value") {
        //-----------------------------
        //update the data for a simple value entry
        //-----------------------------
        this.createValueEntry(this.data);
    }
    else {
        //-----------------------------
        //update the child key entries
        //-----------------------------
        this.createChildKeyEntries(this.data);

        //------------------------
        //update keys as needed
        //------------------------
        this.updateChildKeys();

        //----------------------------
        //update the dom element list
        //----------------------------
        this.createElementList();
    }
}

//============================
// Accessors
//============================

hax.jsonedit.ValueEntry.prototype.getInitialValue = function() {
    return this.data;
}

hax.jsonedit.ValueEntry.prototype.getCurrentValue = function() {
	var value;
    var i;
    var keyEntry;
    if(this.type == "value") {
        //create a simple element
        value = this.valueEditObject.getValue();
    }
    else if(this.type == "object") {
        value = {};
        for(i = 0; i < this.childKeyEntries.length; i++) {
            keyEntry = this.childKeyEntries[i];
            value[keyEntry.getCurrentKey()] = keyEntry.getCurrentValue();
        }
    }
    else if(this.type == "array") {
        value = [];
        for(i = 0; i < this.childKeyEntries.length; i++) {
            keyEntry = this.childKeyEntries[i];
            value[i] = keyEntry.getCurrentValue();
        }
    }
    return value;
}

hax.jsonedit.ValueEntry.prototype.getType = function() {
	return this.type;
}

hax.jsonedit.ValueEntry.prototype.setExpanded = function(isExpanded) {
	this.isExpanded = isExpanded;
    this.doExpandContract();
}

hax.jsonedit.ValueEntry.prototype.getElementList = function() {
	return this.elementList;
}

hax.jsonedit.ValueEntry.prototype.getValueEditObject = function() {
	return this.valueEditObject;
}

hax.jsonedit.ValueEntry.prototype.getIndentLevel = function() {
	return this.indentLevel;
}

hax.jsonedit.ValueEntry.prototype.setIsVirtual = function(isVirtual) {
	this.isVirtual = isVirtual;  
    
	this.valueEditObject.setIsVirtual(isVirtual);
}



//----------------------------
// Navigation between cells
//----------------------------

/** This navigates to a next cell on completion of editing. 
 * @private */
hax.jsonedit.ValueEntry.prototype.navigateCells = function(direction) {
    var parentValue = this.parent.getParentValueObject();
    if(parentValue) {
        parentValue.navigateChildren(this.parent,false,direction);
    }
}

/** This method determines the place to navigation to, and starts editing there
 * if the re is a valid location. 
 * @private */
hax.jsonedit.ValueEntry.prototype.navigateChildren = function(keyEntry,originIsKey,direction) {
    
    //gerate the nav fruls
    var destIsKey = false;
    var deltaIndex = 0;
    var doMove;
    
    if(this.type == "array") {
        if((direction == hax.jsonedit.EditField.DIRECTION_NEXT)||(direction == hax.jsonedit.EditField.DIRECTION_DOWN)) {
            doMove = !originIsKey;
            if(doMove) {
                destIsKey = false;
                deltaIndex = 1;
            }
        }
        else if((direction == hax.jsonedit.EditField.DIRECTION_PREV)||(direction == hax.jsonedit.EditField.DIRECTION_UP)) {
            doMove = !originIsKey;
            if(doMove) {
                destIsKey = false;
                deltaIndex = -1;
            }
        }
        else if((direction == hax.jsonedit.EditField.DIRECTION_RIGHT)||(direction == hax.jsonedit.EditField.DIRECTION_LEFT)) {
            doMove = false;
        }
    }
    else if(this.type == "object") {
        if(direction == hax.jsonedit.EditField.DIRECTION_NEXT) {
            doMove = true;
            destIsKey = !originIsKey;
            deltaIndex = originIsKey ? 0 : 1;  
        }
        else if(direction == hax.jsonedit.EditField.DIRECTION_PREV) {
            doMove = true;
            destIsKey = !originIsKey;
            deltaIndex = originIsKey ? -1 : 0; 
        }
        else if(direction == hax.jsonedit.EditField.DIRECTION_RIGHT) {
            doMove = originIsKey;
            if(doMove) {
                destIsKey = false;
                deltaIndex = 0; 
            }
        }
        else if(direction == hax.jsonedit.EditField.DIRECTION_LEFT) {
            doMove = !originIsKey;
            if(doMove) {
                destIsKey = true;
                deltaIndex = 0; 
            }
        }
        else if(direction == hax.jsonedit.EditField.DIRECTION_UP) {
            doMove = true;
            destIsKey = originIsKey;
            deltaIndex = -1; 
        }
        else if(direction == hax.jsonedit.EditField.DIRECTION_DOWN) {
            doMove = true;
            destIsKey = originIsKey;
            deltaIndex = 1; 
        }
    }
    
    if(doMove) {
    	var oldIndex;
        var newIndex = -1;
        var newKeyEntry = null;
        var editObject;

		//get the old index
		if(keyEntry == this.virtualChildKey) {
        	oldIndex = this.childKeyEntries.length;
        }
        else {
        	oldIndex = this.childKeyEntries.indexOf(keyEntry);
        }

        //get the new key
        if(oldIndex >= 0) {
            newIndex = oldIndex + deltaIndex;
            if((newIndex >= 0)&&(newIndex < this.childKeyEntries.length)) {
                //get key entry - the normal ones
                newKeyEntry = this.childKeyEntries[newIndex];
            }
            else if(newIndex == this.childKeyEntries.length) {
                //this is the index of the virtual key
                newKeyEntry = this.virtualChildKey;
            }
        }
            
        //get the edit field
		if(newKeyEntry) {
			
			if(destIsKey) {
				//get key entry - presumably this is not an array
				editObject = newKeyEntry.keyEditObject;
			}
			else {
				var valueEntry = newKeyEntry.valueEntry;
				//only navigation if the dest cell is a value. 
				//if it is an array or object do not navigate
				if(valueEntry.getType() == "value") {
					editObject = valueEntry.valueEditObject;
				}
			}
		}

		//if we found a valid edit object, start editing
		if(editObject) {
			editObject.startEdit();
		}
    }
}

//--------------------------
// Edit Operations
//--------------------------

/** This method inserts an element at the given index. If the index is left blank
 * the entry is inserted at the end of the list. The value of key is ignored if
 * the entry is an array. */
hax.jsonedit.ValueEntry.prototype.insertElement = function(key,value,index) {

    var childKeyEntry;
    
    //get the insert index
    if(index === undefined) {
        index = this.childKeyEntries.length;
    }
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
    var insertBefore;
    if(index >= this.childKeyEntries.length) {
        insertBefore = this.virtualChildKey.getElement();
    }
    else {
        insertBefore = this.childKeyEntries[index].getElement();
    }
    
    if(this.type == "object") {
        childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,key,"key",value,this.isEditable,false);     
    }
    else if(this.type == "array") {
        childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,index,"index",value,this.isEditable,false);
        
        //we also need to update all the keys larger than this one
        for(var newIndex = index+1; newIndex < this.childKeyEntries.length; newIndex++) {
            this.childKeyEntries[newIndex].setKey(newIndex);
        }
        this.virtualChildKey.setKey(this.childKeyEntries.length + 1);
    }
    
    this.childKeyEntries.splice(index,0,childKeyEntry);
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();
    
    //----------------------------
    //update the dom element list
    //----------------------------
    this.listDiv.insertBefore(childKeyEntry.getElement(),insertBefore);
}

/** this method swaps the given key with the next key in the list. */
hax.jsonedit.ValueEntry.prototype.moveChildKeyToNextIndex = function(index) {
    if((index < 0)||(index >= this.childKeyEntries.length -1)) {
        //illegal index
        alert("Can not make the specified key move");
        return;
    }
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
    var oldFirstKey = this.childKeyEntries[index];
    var oldSecondKey = this.childKeyEntries[index+1];
    
    this.childKeyEntries[index] = oldSecondKey;
    this.childKeyEntries[index+1] = oldFirstKey;
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();
    
    //----------------------------
    //update the dom element list
    //----------------------------
    this.listDiv.insertBefore(oldSecondKey.getElement(),oldFirstKey.getElement());
    
}

/** This method inserts an element at the given index. If the index is left blank
 * the entry is inserted at the end of the list. The value of key is ignored if
 * the entry is an array. */
hax.jsonedit.ValueEntry.prototype.deleteChildElement = function(keyEntry) {
    
    var index = this.childKeyEntries.indexOf(keyEntry);
    if(index == -1) {
        alert("Element not found!");
        return;
    }
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
    this.childKeyEntries.splice(index,1);
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();
    
    //----------------------------
    //update the dom element list
    //----------------------------
    this.listDiv.removeChild(keyEntry.getElement());
}


///////////////////////////////////////////////////////////////////////////////

//------------------------------
// Conversions
//------------------------------


hax.jsonedit.ValueEntry.prototype.convertibleToNumber = function() {
    if(this.type === "value") {
        var currentValue = this.getCurrentValue();
        var valueType = hax.jsonedit.getValueType(currentValue);
        if(valueType === "string") {
            return isFinite(currentValue);
        }
    }
    return false;
}

hax.jsonedit.ValueEntry.prototype.convertibleToBool = function() {
    if(this.type === "value") {
        var currentValue = this.getCurrentValue();
        var valueType = hax.jsonedit.getValueType(currentValue);
        if(valueType === "string") {
            return hax.jsonedit.isBoolString(currentValue);
        }
    }
    return false;
}

hax.jsonedit.ValueEntry.prototype.convertibleToNull = function() {
    if(this.type === "value") {
        var currentValue = this.getCurrentValue();
        var valueType = hax.jsonedit.getValueType(currentValue);
        if(valueType === "string") {
            return hax.jsonedit.isNullString(currentValue);
        }
    }
    return false;
}

//this converts a string to a number or boolean
hax.jsonedit.ValueEntry.prototype.valueToNonString = function() {
    var currentValue = this.getCurrentValue();
    //change the data in this object
    var newData = hax.jsonedit.stringToNonString(currentValue);
    this.valueEditObject.setValue(newData);
    
    //notify of edit
    this.editArea.valueEdited();
}

hax.jsonedit.ValueEntry.prototype.convertibleToString = function() {
    if(this.type === "value") {
        var currentValue = this.getCurrentValue();
        var valueType = hax.jsonedit.getValueType(currentValue);
        return (valueType !== "string");
    }
    return false;
}

hax.jsonedit.ValueEntry.prototype.valueToString = function() {
    var currentValue = this.getCurrentValue();
    //change the data in this object
    var newData = String(currentValue);
    this.valueEditObject.setValue(newData);
    
    //notify of edit
    this.editArea.valueEdited();
}


hax.jsonedit.ValueEntry.prototype.valueToArray = function() {
    if(!this.type == "value") {
        throw "Type value expected. Found " + this.type;
    }
    this.type = "array";
    
    //these are the edit elements
    var newValue = [this.valueEditObject.getValue()];
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
	this.createChildKeyEntries(newValue);
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();

    //----------------------------
    //update the dom element list
    //----------------------------
    this.createElementList();
    
    //refresh the parent key
    if(this.parent) {
        var parentValueObject = this.parent.getParentValueObject();
        if(parentValueObject) {
            parentValueObject.updateChildKeys();
        }
        
        this.parent.updateValueElements();
    }
    
    //notify of edit
    this.editArea.valueEdited();
}

hax.jsonedit.ValueEntry.prototype.valueToObject = function() {
    if(!this.type == "value") {
        throw "Type value expected. Found " + this.type;
    }
    this.type = "object";
    
    //these are the edit elements
    var newValue = {"a":this.valueEditObject.getValue()};
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
	this.createChildKeyEntries(newValue);
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();

    //----------------------------
    //update the dom element list
    //----------------------------
    this.createElementList();
   
    //refresh the parent key
    if(this.parent) {
        var parentValueObject = this.parent.getParentValueObject();
        if(parentValueObject) {
            parentValueObject.updateChildKeys();
        }
        
        this.parent.updateValueElements();
    }
    
    //notify of edit
    this.editArea.valueEdited();
}

hax.jsonedit.ValueEntry.prototype.objectToArray = function() {
    if(!this.type == "object") {
        throw "Type object expected. Found " + this.type;
    }
    this.type = "array";
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
    //reconfigure the existing list (rather than remaking all the objects)
    var i = 0;
    if(this.childKeyEntries) {
        for(i = 0; i < this.childKeyEntries.length; i++) {
            var childKeyEntry = this.childKeyEntries[i];
            childKeyEntry.convertToIndexType(i);
        }
    }
	if(this.virtualChildKey) {
		this.virtualChildKey.convertToIndexType(i);
	}
    
    //these are the edit elements
    this.valueEditObject = null;
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();
    
    //----------------------------
    //update the dom element list
    //----------------------------
    this.createElementList();
    
    //refresh the parent key
    if(this.parent) {
        var parentValueObject = this.parent.getParentValueObject();
        if(parentValueObject) {
            parentValueObject.updateChildKeys();
        }
        
        this.parent.updateValueElements();
    }
    
    //notify of edit
    this.editArea.valueEdited();
}

hax.jsonedit.ValueEntry.prototype.arrayToObject = function() {
    if(!this.type == "array") {
        throw "Type array expected. Found " + this.type;
    }
    this.type = "object";
    
    //-----------------------------
    //update the child key entries
    //-----------------------------
    //reconfigure the existing list (rather than remaking all the objects)
	var i = 0;
    if(this.childKeyEntries) {
        for(i = 0; i < this.childKeyEntries.length; i++) {
            var childKeyEntry = this.childKeyEntries[i];
            childKeyEntry.convertToKeyType(String(i));
        }
    }
	if(this.virtualChildKey) {
		this.virtualChildKey.convertToKeyType("");
	}
    
    //------------------------
    //update keys as needed
    //------------------------
    this.updateChildKeys();

    //----------------------------
    //update the dom element list
    //----------------------------
    this.createElementList();
    
    //refresh the parent key
    if(this.parent) {
        var parentValueObject = this.parent.getParentValueObject();
        if(parentValueObject) {
            parentValueObject.updateChildKeys();
        }
        
        this.parent.updateValueElements();
    }
    
    //notify of edit
    this.editArea.valueEdited();
}

hax.jsonedit.ValueEntry.prototype.convertToValue = function() {
    if(this.type == "value") {
        return;
    }
   
    //update type
    this.type = "value";
    
    var value;
    if((this.childKeyEntries)&&(this.childKeyEntries.length > 0)) {
        var firstChildKey = this.childKeyEntries[0];
        value = firstChildKey.getCurrentValue();
    }
    else {
        value = "";
    }
    
    //-----------------------------
    //update the data for a simple value entry
    //-----------------------------
    this.createValueEntry(value);
    
    //refresh the parent key
    if(this.parent) {
        var parentValueObject = this.parent.getParentValueObject();
        if(parentValueObject) {
            parentValueObject.updateChildKeys();
        }
        
        this.parent.updateValueElements();
    }
    
    //notify of edit
    this.editArea.valueEdited();
}

//==============================
// Construction Methods
//==============================

/** This method constructs the contents for a value entry
 * @private */
hax.jsonedit.ValueEntry.prototype.createValueEntry = function(elementsData) {
    if(this.type != "value") return;
    
    this.valueEditObject = null;
    this.childKeyEntries = [];
	this.virtualChildKey = null;
	this.elementList = [];
	
    //create the value element
    this.createValueElement(elementsData);

    //clear the list elements
    this.listDiv = null;
    this.contractedList = null;
    this.expandedList = null;
}

/** This method constructs the contents for an array or object
 * @private */
hax.jsonedit.ValueEntry.prototype.createChildKeyEntries = function(elementsData) {
    if(this.type == "value") return;
    
	//initialize data elements
    this.valueEditObject = null;
    this.childKeyEntries = [];
	this.virtualChildKey = null;
	this.elementList = [];

    //create the child keys for the object or array
    var childKeyEntry;
    if(this.type == "object") { 
        for(var key in elementsData) {
            childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,key,"key",elementsData[key],this.isEditable,false);
            this.childKeyEntries.push(childKeyEntry);
        }

        //add a dummy entry if this is editable
		if(this.isEditable) {
			childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,"","key","",this.isEditable,true);
			this.virtualChildKey = childKeyEntry;
		}
    }
    else if(this.type == "array") {
        for(var keyIndex = 0; keyIndex < elementsData.length; keyIndex++) {
            childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,keyIndex,"index",elementsData[keyIndex],this.isEditable,false);
            this.childKeyEntries.push(childKeyEntry);
        }

		//add a dummy entry if this is editable
		if(this.isEditable) {
			childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,keyIndex,"index","",this.isEditable,true);
			this.virtualChildKey = childKeyEntry;
		}
    }

}

/** This create the dom element list for the child key entries 
* @private */
hax.jsonedit.ValueEntry.prototype.createElementList = function() {

    //initialize elements
	this.listDiv = document.createElement("div");
    this.elementList = [];
    this.contractedList = [];
    this.expandedList = [];
    
    var startDelimiter;
    var endDelimiter1;
    var endDelimiter2;
    var endIndent = hax.jsonedit.createIndentElement(this.indentLevel);

	//list element
	var childKeyEntry;
	for(var i = 0; i < this.childKeyEntries.length; i++) {
		childKeyEntry = this.childKeyEntries[i];
		this.listDiv.appendChild(childKeyEntry.getElement());
	}
	if(this.virtualChildKey) {
		this.listDiv.appendChild(this.virtualChildKey.getElement());
	}

    //buttons
    var expandButton = hax.jsonedit.createExpandButton(this);
    var contractButton = hax.jsonedit.createContractButton(this);

    if(this.type == "object") { 
        startDelimiter = hax.jsonedit.createObjectDelimiter("{");
        endDelimiter1 = hax.jsonedit.createObjectDelimiter("}");
        endDelimiter2 = hax.jsonedit.createObjectDelimiter("}");
    }
    else if(this.type == "array") {
        startDelimiter = hax.jsonedit.createObjectDelimiter("[");
        endDelimiter1 = hax.jsonedit.createObjectDelimiter("]");
        endDelimiter2 = hax.jsonedit.createObjectDelimiter("]");
    }

    //save the elements
    //shared
    this.elementList.push(startDelimiter);

    //contracted elements
    this.elementList.push(expandButton);
    this.contractedList.push(expandButton);

    this.elementList.push(endDelimiter1);
    this.contractedList.push(endDelimiter1);

    //expanded elements
    this.elementList.push(contractButton);
    this.expandedList.push(contractButton);

    if((this.childKeyEntries.length > 0)||(this.virtualChildKey)) {
        this.elementList.push(this.listDiv);
        this.expandedList.push(this.listDiv);

        //indent before the closing brace
        this.elementList.push(endIndent);
        this.expandedList.push(endIndent);
    }
    this.elementList.push(endDelimiter2);
    this.expandedList.push(endDelimiter2);

    //set the expand.contract visibility
    this.doExpandContract();
}


/** This method updates the keys with the context menu and makes
 * sure the keys are corect for array entries. 
 * @private */
hax.jsonedit.ValueEntry.prototype.updateChildKeys = function() {
    var numberKeys;
    var keyIndex;
    
    if(this.type == "object") {
        var key;
        
        //count keys
        numberKeys = 0;
        for(key in this.childKeyEntries) {
            numberKeys++;
        }

        keyIndex = 0;
        for(key in this.childKeyEntries) {
            var childKeyEntry = this.childKeyEntries[key];
            
            //set the context menu
            childKeyEntry.loadContextMenu(numberKeys,keyIndex);
            keyIndex++;
        }
        
        //context menu
		if(this.virtualChildKey) {
			this.virtualChildKey.loadContextMenu(numberKeys,numberKeys);
		}
    }
    else if(this.type == "array") {
        numberKeys = this.childKeyEntries.length;
        
        //set context menu and make sure index is correct
        for(keyIndex = 0; keyIndex < numberKeys; keyIndex++) {
            childKeyEntry = this.childKeyEntries[keyIndex];
            
            //make sure the index is correct
            if(childKeyEntry.getCurrentKey() != keyIndex) {
                childKeyEntry.setKey(keyIndex);
            }
            
            //set the context menu
            childKeyEntry.loadContextMenu(numberKeys,keyIndex);
        }
        
        if(this.virtualChildKey) {
            if(this.virtualChildKey.getCurrentKey() != numberKeys) {
                this.virtualChildKey.setKey(numberKeys);
            }
            
            //context menu
            this.virtualChildKey.loadContextMenu(numberKeys,numberKeys);
        }
    }
}


hax.jsonedit.ValueEntry.prototype.doExpandContract = function() {
	if((!this.expandedList)||(!this.contractedList)) return;
	
	var onList = this.isExpanded ? this.expandedList : this.contractedList;
	var offList = !this.isExpanded ? this.expandedList : this.contractedList;
	
	var i;
	var element;
	for(i = 0; i < onList.length; i++) {
		element = onList[i];
		element.style.display = "";
	}
	for(i = 0; i < offList.length; i++) {
		element = offList[i];
		element.style.display = "none";
	}
}


/** This creates the edit element for the entry. Only needed on type "value" 
* @private */
hax.jsonedit.ValueEntry.prototype.createValueElement = function(data) {

    //create a simple element
    this.valueEditObject = new hax.jsonedit.EditField(data,hax.jsonedit.EditField.FIELD_TYPE_VALUE,this.isEditable,this.isVirtual);
    var instance = this;
    
    //make the edit field editable if it is a key
    var onEdit = function(editValue) {
        if(instance.isVirtual) {
            var parentValueObject = instance.parent.getParentValueObject();
            if(parentValueObject) {
                parentValueObject.makeVirtualEntryReal();
            }
        }
        
        //notify of edit
        instance.editArea.valueEdited();
    }
    this.valueEditObject.setOnEditCallback(onEdit);

    
    //set the navgation callback
    var navCallback = function(direction) {
        instance.navigateCells(direction);
    }
    this.valueEditObject.setNavCallback(navCallback);
    
    var element = this.valueEditObject.getElement();
    this.elementList.push(element);
}



/** This wraps the list elements into the proper format. */
hax.jsonedit.ValueEntry.prototype.makeVirtualEntryReal = function(data) {
    var newRealEntry = this.virtualChildKey
    newRealEntry.setIsVirtual(false);
    this.childKeyEntries.push(newRealEntry);
    
    var childKeyEntry;
    if(this.type == "object") { 
        //add a dummy entry
        childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,"","key","",this.isEditable,true);
        this.virtualChildKey = childKeyEntry;
    }
    else if(this.type == "array") {
        //add a dummy entry
        childKeyEntry = new hax.jsonedit.KeyEntry(this.editArea,this,this.childKeyEntries.length,"index","",this.isEditable,true);
        this.virtualChildKey = childKeyEntry;
    }
    
    this.updateChildKeys();
    
    this.createElementList();
    
    this.parent.updateValueElements();
    
}



;
/** This is an edit field. If an overide change callback is added
 * it will be called after an edit and the value of this field will
 * be returned to the previous value. Otherwise, the value of the field
 * fill be updated to match the edit.
 */
hax.jsonedit.EditField = function (value,fieldType,isEditable,isVirtual) {
	this.fieldType = fieldType;
	this.isEditable = isEditable;
	this.isVirtual = isVirtual;
	
    this.element = document.createElement("div");
       
    this.onEdit = null;
    this.onNavigate = null;
    
    //this will be set while the element is being edited
    this.editField = null;
    
    //start editing on a click
    var instance = this;
    this.element.onclick = function() {
		instance.onClick();
	};
   
    this.setValue(value);
}

hax.jsonedit.EditField.FIELD_TYPE_VALUE = "value";
hax.jsonedit.EditField.FIELD_TYPE_KEY = "key";
hax.jsonedit.EditField.FIELD_TYPE_INDEX = "index";

hax.jsonedit.EditField.prototype.setOnEditCallback= function(onEdit) {
    return this.onEdit = onEdit;
}

hax.jsonedit.EditField.prototype.setNavCallback = function(onNavigate) {
    this.onNavigate = onNavigate;
}

hax.jsonedit.EditField.prototype.setIsVirtual = function(isVirtual) {
    this.isVirtual = isVirtual;
	this.setCssClass();
}

hax.jsonedit.EditField.prototype.getValue= function() {
    return this.value;
}

hax.jsonedit.EditField.prototype.setValue = function(value) {
	
	if(value === undefined) {
		value = null;
		console.log("The value undefined is not valid for a JSON. It has been converted to null.");
	}
	
    this.value = value;
    this.isString = (hax.jsonedit.getValueType(value) === "string");
	this.setCssClass();

	//display value (with some exceptions)
	if(value === null) {
		//show null for null value
		this.element.innerHTML = "null"
	}
	else if(value === "") {
		//this keeps the height from shrinking
		this.element.innerHTML = "&nbsp;"
	}
	else {
		this.element.innerHTML = value;
	}
}

/** @private */
hax.jsonedit.EditField.prototype.setCssClass = function() {
	var cssName = "cell_base cell_" + this.fieldType;
	if(this.isVirtual) {
		cssName += "_virtual";
	}
	else if(this.fieldType === "value") {
		if(this.isString) {
			cssName += "_string";
		}
		else {
			cssName += "_nonstring";
		}
	}
	
	this.element.className = cssName;
}

hax.jsonedit.EditField.prototype.getElement = function() {
    return this.element;
}

hax.jsonedit.EditField.prototype.onClick = function() {
    if((this.isEditable)&&(!this.editField)) {
        this.startEdit();
    }
 
}

hax.jsonedit.EditField.prototype.startEdit = function() {
    if(!this.editField) {
    
        //get the selection
        var selection = getSelection();
        var selectInfo;
        if(selection.anchorNode.parentNode == this.element) {
            selectInfo = {};
            if(selection.anchorOffset <= selection.focusOffset) {
                selectInfo.start = selection.anchorOffset;
                selectInfo.end = selection.focusOffset;
            }
            else {
                selectInfo.start = selection.focusOffset;
                selectInfo.end = selection.anchorOffset;
            }
        }
        else {
            selectInfo = null;
        }    
        
        //create the edit field
        this.editField = document.createElement("input");
		this.editField.type = "text";
		if(this.value !== undefined) {
			this.editField.value = this.value;
		}
		
		hax.core.util.removeAllChildren(this.element);
        this.element.appendChild(this.editField);
        
        //select the entry
        if(selectInfo) {
            this.editField.setSelectionRange(selectInfo.start,selectInfo.end);
        }
        else {
            this.editField.select();
        }
        this.editField.focus();
        
        //event handlers to end edit
        var instance = this;
        this.editField.onblur = function() {
            instance.endEdit();
        };
        this.editField.onkeydown = function(event) {
            instance.onKeyDown(event);
        };
    }
}

//value output conversion rules
// - if the initial value was a non-string or an empty string, try to convert the contents of the edit cell to a non-string
// - otherwise keep the value as a string when it is loaded from the edit field

hax.jsonedit.EditField.prototype.endEdit = function() {
    if(this.editField) {
        var newValue = this.editField.value;
        if(newValue != this.value) {
            //read the value, in the appropriate format
            var editStringValue = this.editField.value;
            var editValue;
            if((!this.isString)||(this.value === "")) {
				//try to convert to a number if the original value was a number if it was an empty string
                if(hax.jsonedit.canBeConvertedToNonString(editStringValue)) {
                    editValue = hax.jsonedit.stringToNonString(editStringValue);
                }
                else {
                    editValue = editStringValue;
                }
            }
            else {
                editValue = editStringValue;
            }
            
            this.editField = null;
            this.setValue(editValue);
            
            if(this.onEdit) {
                this.onEdit(this.value);
            }
        }
        else {
            this.editField = null;
            this.element.innerHTML = this.value;
        }
    }
}

hax.jsonedit.EditField.DIRECTION_NONE = 0;
hax.jsonedit.EditField.DIRECTION_UP = 1;
hax.jsonedit.EditField.DIRECTION_DOWN = 2;
hax.jsonedit.EditField.DIRECTION_RIGHT = 3;
hax.jsonedit.EditField.DIRECTION_LEFT = 4;
hax.jsonedit.EditField.DIRECTION_NEXT = 5;
hax.jsonedit.EditField.DIRECTION_PREV = 6;

hax.jsonedit.EditField.ENTER_KEY = 13;
hax.jsonedit.EditField.TAB_KEY = 9;
hax.jsonedit.EditField.UP_KEY = 38;
hax.jsonedit.EditField.DOWN_KEY = 40;
hax.jsonedit.EditField.RIGHT_KEY = 39;
hax.jsonedit.EditField.LEFT_KEY = 37;

//navigation rules:
//- tab/enter and shift tab/enter go to the next and previous active field
//This visits only values on array and both keys and values on object
//- right goes from key to value (object only) if it is in the last selection spot
//- left goes from value to key (object only) if it is in the first selection spot
//- up goes to the same element (key or value) in the previous entry
//- down goes to the same element (key or value) in the next entry
//- navigation only happens when the field is a editable key or a simple value. If
//the entry is an array or object, we do not go there.
//- any time we don not go to the given field, we go nowhere, ending navigation
//- when we enter a field through navigation or click, it should select the entire field.


hax.jsonedit.EditField.prototype.onKeyDown = function(event) {
    var doExit = false;
    var direction = hax.jsonedit.EditField.DIRECTION_NONE;
    var cancelDefault = false;
    if(event.keyCode == hax.jsonedit.EditField.ENTER_KEY) {
        //next or prev, based on shift key
        doExit = true;
        direction = event.shiftKey ? hax.jsonedit.EditField.DIRECTION_PREV : hax.jsonedit.EditField.DIRECTION_NEXT;
        cancelDefault = true;
	}
    else if(event.keyCode == hax.jsonedit.EditField.TAB_KEY) {
        //next or prev, based on shift key
        doExit = true;
        direction = event.shiftKey ? hax.jsonedit.EditField.DIRECTION_PREV : hax.jsonedit.EditField.DIRECTION_NEXT;
        cancelDefault = true;
    }
    else if(event.keyCode == hax.jsonedit.EditField.UP_KEY) {
        doExit = true;
        direction = hax.jsonedit.EditField.DIRECTION_UP;
        cancelDefault = true;
    }
    else if(event.keyCode == hax.jsonedit.EditField.DOWN_KEY) {
        doExit = true;
        direction = hax.jsonedit.EditField.DIRECTION_DOWN;
        cancelDefault = true;
    }
    else if(event.keyCode == hax.jsonedit.EditField.RIGHT_KEY) {
        if(this.cursorAtEndOfEditField()) {
            doExit = true;
            direction = hax.jsonedit.EditField.DIRECTION_RIGHT;
            cancelDefault = true;
        }
    }
    else if(event.keyCode == hax.jsonedit.EditField.LEFT_KEY) {
        if(this.cursorAtStartOfEditField()) {
            doExit = true;
            direction = hax.jsonedit.EditField.DIRECTION_LEFT;
            cancelDefault = true;
        }
    }
    
    if(cancelDefault) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if(doExit) {
        this.endEdit();
        if((direction != hax.jsonedit.EditField.DIRECTION_NONE)&&(this.onNavigate)) {
            this.onNavigate(direction);
        }
    }
}

hax.jsonedit.EditField.prototype.cursorAtStartOfEditField = function() {
    return ((this.editField.selectionStart == 0)&&(this.editField.selectionEnd == 0));
}

hax.jsonedit.EditField.prototype.cursorAtEndOfEditField = function() {
    var length = String(this.editField.value).length;
    return ((this.editField.selectionStart == length)&&(this.editField.selectionEnd == length));
};

hax.jsonedit.JsonEditArea = function(divElement,initialValue,isEditable) {
    this.body = divElement;
	this.isEditable = isEditable;
	
	//undefined is not a valid json value and will screw things up
	if(initialValue === undefined) {
		initialValue = "";
	}
    
	this.valueEntry = new hax.jsonedit.ValueEntry(this,this,initialValue,this.isEditable);
    this.valueEntry.setExpanded(true);
 
	this.formatBody();
}

hax.jsonedit.JsonEditArea.prototype.setEditCallback = function(editCallback) {
	this.editCallback = editCallback;
}

hax.jsonedit.JsonEditArea.prototype.getCurrentValue = function() {
	return this.valueEntry.getCurrentValue();
}

hax.jsonedit.JsonEditArea.prototype.getElement = function() {
	return this.body;
}

hax.jsonedit.JsonEditArea.prototype.getParentValueObject = function() {
	return undefined;
}

hax.jsonedit.JsonEditArea.prototype.getIndentLevel = function() {
	return 0;
}

hax.jsonedit.JsonEditArea.prototype.formatBody = function() {
    var elementList = this.valueEntry.getElementList();
    for(var i = 0; i < elementList.length; i++) {
        this.body.appendChild(elementList[i]);
    }
    
    this.loadContextMenu();
}


hax.jsonedit.JsonEditArea.prototype.loadContextMenu = function() {

    var instance = this;
    var element = this.body;
    var valueEntry = this.valueEntry;
    var valueType = valueEntry.getType();
    element.oncontextmenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        var contextMenu = new hax.visiui.MenuBody();
        
        contextMenu.addCallbackMenuItem("Get Value",function() {alert(JSON.stringify(valueEntry.getCurrentValue()));});
        
		if(instance.isEditable) {
			if(valueType == "value") {
				contextMenu.addCallbackMenuItem("Convert To Object",function() {valueEntry.valueToObject()});
				contextMenu.addCallbackMenuItem("Convert To Array",function() {valueEntry.valueToArray()});
				
				  if(valueEntry.convertibleToNumber()) {
                    contextMenu.addCallbackMenuItem("Convert To Number",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToBool()) {
                    contextMenu.addCallbackMenuItem("Convert To Boolean",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToNull()) {
                    contextMenu.addCallbackMenuItem("Convert To Null",function() {valueEntry.valueToNonString()});
                }

                if(valueEntry.convertibleToString()) {
                    contextMenu.addCallbackMenuItem("Convert To String",function() {valueEntry.valueToString()});
                }
			}
			else if(valueType == "object") {
				contextMenu.addCallbackMenuItem("Convert To Value",function() {valueEntry.convertToValue()});
				contextMenu.addCallbackMenuItem("Convert To Array",function() {valueEntry.objectToArray()});
			}
			else if(valueType == "array") {
				contextMenu.addCallbackMenuItem("Convert To Value",function() {valueEntry.convertToValue()});
				contextMenu.addCallbackMenuItem("Convert To Object",function() {valueEntry.arrayToObject()});
			}
		}
        
        hax.visiui.Menu.showContextMenu(contextMenu,event);
    }
  
}

hax.jsonedit.JsonEditArea.prototype.updateValueElements = function() {
    //remove all from element
	hax.core.util.removeAllChildren(this.body);
    //recreate
    this.formatBody();
}

/** This methd is called internally when an edit takes place in the edit are. 
 * @private */
hax.jsonedit.JsonEditArea.prototype.valueEdited = function() {
    if(this.editCallback) {
        this.editCallback();
    }
}




;
/** This file provides a resize listener. The element must be a positioned element
 * (position must be set to something besides static. It can only be called once (!)
 * 
 * It places an iframe inside the element to be tested and uses the onresize of the 
 * iframe document body.
 */

hax.visiui.setResizeListener = function(element, resizeCallback){

    var styleJson = {
        "position":"absolute",
        "top":"0px",
        "left":"0px",
        "width":"100%",
        "height":"100%",
        "overflow":"hidden",
        "zIndex":-1
    };

    var onLoadCallback = function() {
        var dummyFrameBody = dummyFrameElement.contentDocument.body;
        dummyFrameBody.onresize = resizeCallback; 

        //do an initial callback for each
        resizeCallback();

        //we can do an on load too
        //onloadCallback();
    }

    //create and attach element
    var dummyFrameElement = hax.visiui.createElement("iframe",null,styleJson);
    dummyFrameElement.onload = onLoadCallback;
    element.appendChild(dummyFrameElement);
}

hax.visiui.removeResizeListener = function(element, resizeCallback){
    alert("implement this!");
}


;
if(!hax.app) hax.app = {};
if(!hax.app.visiui) hax.app.visiui = {};
if(!hax.app.visiui.dialog) hax.app.visiui.dialog = {};

/** This is the main class of the hax application. */
hax.app.visiui.Hax = function(containerId) {
    
    //temp - until we figure out what to do with menu and events
    //for now we have application events, using the EventManager mixin below.
    hax.core.EventManager.init.call(this);
    
    //workspaces
    this.workspaceUIs = {};
    
    //component generators
    this.componentGenerators = {};
    this.standardComponents = [];
    //these are a list of names of components that go in the "added component" list
    this.additionalComponents = [];
	
	this.linkManager = new hax.app.visiui.LinkManager();
	
	//load the standard component generators
	this.loadComponentGenerators();
	
	//create the UI
	this.createUI(containerId);
    
    //open a workspace - from url or default
    var workspaceUrl = hax.core.util.readQueryField("url",document.URL);
    if(workspaceUrl) {
        hax.app.visiui.openworkspace.openWorkspaceFromUrl(this,workspaceUrl);
    }
    else {
        //create a default workspace 
        hax.app.visiui.createworkspace.createWorkspace(this,hax.app.visiui.Hax.DEFAULT_WORKSPACE_NAME);
    }
}
	
//add components to this class
hax.core.util.mixin(hax.app.visiui.Hax,hax.core.EventManager);

hax.app.visiui.Hax.DEFAULT_WORKSPACE_NAME = "workspace";

hax.app.visiui.Hax.prototype.getWorkspace = function(name) {
    var workspaceUI = this.getWorkspaceUI(name);
	if(workspaceUI) {
		return workspaceUI.getWorkspace();
	}
	else {
		return null;
	}
}

hax.app.visiui.Hax.prototype.getWorkspaceUI = function(name) {
	return this.workspaceUIs[name];
}

hax.app.visiui.Hax.prototype.getActiveWorkspaceUI = function() {
    var name = this.tabFrame.getActiveTabTitle();
    if(name) {
        return this.workspaceUIs[name];
    }
    else {
        return null;
    }
}

hax.app.visiui.Hax.prototype.getActiveWorkspace = function() {
    var workspaceUI = this.getActiveWorkspaceUI();
	if(workspaceUI) {
		return workspaceUI.getWorkspace();
	}
	else {
		return null;
	}
}

//==================================
// Workspace Management
//==================================

/** This method makes an empty workspace ui object. This throws an exception if
 * the workspace can not be opened.
 */
hax.app.visiui.Hax.prototype.addWorkspaceUI = function(workspaceUI,name) {
    
    //we can only have one workspace of a given name!
    if(this.workspaceUIs[name]) {
        throw hax.core.util.createError("There is already an open workspace with the name " + name,false);
    }
    
	var tab = this.tabFrame.addTab(name);
    this.tabFrame.setActiveTab(name);
    workspaceUI.setApp(this,tab);
    this.workspaceUIs[name] = workspaceUI;
    return true;
}

/** This method closes the active workspace. */
hax.app.visiui.Hax.prototype.removeWorkspaceUI = function(name) {
    //remove the workspace from the app
    delete this.workspaceUIs[name];
    this.tabFrame.removeTab(name);
    return true;
}

//==================================
// Link Management
//==================================

/** This method adds links as registered by a given workspace. Links can be added and
 * removed. Removing links may or may not remove them from the page (currently
 * js links are not removed and css links are, once they are not used by any 
 * workspase. The linksLoadedCallback is optional. It is called when all links have
 * been loaded on the page.
 */
hax.app.visiui.Hax.prototype.updateWorkspaceLinks = function(workspaceName,addList,removeList,linksLoadedCallback) {
	this.linkManager.updateWorkspaceLinks(workspaceName,addList,removeList,linksLoadedCallback);
}

//=================================
// Component Management
//=================================

/** This method registers a component. */
hax.app.visiui.Hax.prototype.registerComponent = function(componentGenerator) {
    var name = componentGenerator.uniqueName;
    if(this.componentGenerators[name]) {
//in the future we can maybe do something other than punt
        alert("There is already a registered component with this name. Either the component has already been added of the name is not unique.");
        return;
    }

//we should maybe warn if another component bundle is being overwritten 
    this.componentGenerators[name] = componentGenerator;
    this.additionalComponents.push(name);
}

/** This method registers a component. */
hax.app.visiui.Hax.prototype.getComponentGenerator = function(name) {
	return this.componentGenerators[name];
}
//==========================
// App Initialization
//==========================

/** This method adds the standard components to the app. 
 * @private */
hax.app.visiui.Hax.prototype.loadComponentGenerators = function() {
    //standard components
    this.registerStandardComponent(hax.app.visiui.JsonTableComponent.generator);
    this.registerStandardComponent(hax.app.visiui.GridTableComponent.generator);
	this.registerStandardComponent(hax.app.visiui.FolderComponent.generator);
	this.registerStandardComponent(hax.app.visiui.FunctionComponent.generator);
    this.registerStandardComponent(hax.app.visiui.FolderFunctionComponent.generator);
	
    //additional components
    this.registerComponent(hax.app.visiui.CustomControlComponent.generator);
}

/** This method registers a component. 
 * @private */
hax.app.visiui.Hax.prototype.registerStandardComponent = function(componentGenerator) {
    var name = componentGenerator.uniqueName;
    if(this.componentGenerators[name]) {
//in the future we can maybe do something other than punt
        alert("There is already a registered component with this name. Either the component has already been added of the name is not unique.");
        return;
    }

//we should maybe warn if another component bundle is being overwritten 
    this.componentGenerators[name] = componentGenerator;
    this.standardComponents.push(name);
}

/** This method creates the app ui. 
 * @private */
hax.app.visiui.Hax.prototype.createUI = function(containerId) {
    
    var windowElements = hax.visiui.initWindows(containerId);
    var topContainer = windowElements.baseElement;
    
    var container = document.createElement("div");
    var containerStyle = {
        "position":"relative",
        "display":"table",
        "width":"100%",
        "height":"100%"
    };
    hax.visiui.applyStyle(container,containerStyle);
    topContainer.appendChild(container);
    
    
    
    //-------------------
    //create menus
    //-----------------------
    var menuBar = document.createElement("div");
    var menuBarStyle = {
        "position":"relative",
        "display":"table-row",
        "width":"100%",
        "padding":"2px"
    };
    hax.visiui.applyStyle(menuBar,menuBarStyle);
    menuBar.className = "visicomp_menuBarStyle";
    container.appendChild(menuBar);
    
    //create the menus
    var menu;

    //Workspace menu
    menu = hax.visiui.Menu.createMenu("Workspace");
    menuBar.appendChild(menu.getElement());
    
    var newCallback = hax.app.visiui.createworkspace.getCreateCallback(this);
    menu.addCallbackMenuItem("New",newCallback);
    
    var openCallback = hax.app.visiui.openworkspace.getOpenCallback(this);
    menu.addCallbackMenuItem("Open",openCallback);
    
    var saveCallback = hax.app.visiui.saveworkspace.getSaveCallback(this);
    menu.addCallbackMenuItem("Save",saveCallback);
    
    var closeCallback = hax.app.visiui.closeworkspace.getCloseCallback(this);
    menu.addCallbackMenuItem("Close",closeCallback);	
	
    //Components Menu
    menu = hax.visiui.Menu.createMenu("Components");
    menuBar.appendChild(menu.getElement());
    
    //add create child elements
    this.populateAddChildMenu(menu);
    
    //libraries menu
    menu = hax.visiui.Menu.createMenu("Libraries");
    menuBar.appendChild(menu.getElement());
    
    var linksCallback = hax.app.visiui.updatelinks.getUpdateLinksCallback(this);
    menu.addCallbackMenuItem("Update Links",linksCallback);

    //----------------------
    //create the tab frame - there is a tab for each workspace
    //--------------------------
    
    var tabFrameDiv = document.createElement("div");
    var tabFrameDivStyle = {
        "position":"relative",
        "backgroundColor":"white",
        "display":"table-row",
        "width":"100%",
        "height":"100%"
    }
    hax.visiui.applyStyle(tabFrameDiv,tabFrameDivStyle);
    container.appendChild(tabFrameDiv);
    
    var options = {};
    options.tabBarColorClass = "visicomp_tabFrameColor";
    options.activeTabColorClass = "visicomp_tabFrameActiveColor";
    this.tabFrame = new hax.visiui.TabFrame(tabFrameDiv,options);
    
}

//=================================
// Menu Functions
//=================================

hax.app.visiui.Hax.prototype.populateAddChildMenu = function(menu,optionalInitialValues,optionalComponentOptions) {
    
    for(var i = 0; i < this.standardComponents.length; i++) {
        var key = this.standardComponents[i];
        var generator = this.componentGenerators[key];
        var title = "Add " + generator.displayName;
        var callback = hax.app.visiui.updatecomponent.getAddComponentCallback(this,generator,optionalInitialValues,optionalComponentOptions);
        menu.addCallbackMenuItem(title,callback);
    }

    //add the additional component item
    var componentCallback = hax.app.visiui.addadditionalcomponent.getAddAdditionalComponentCallback(this,optionalInitialValues,optionalComponentOptions);
    menu.addCallbackMenuItem("Other Components...",componentCallback);
}

/** This loads the context menu for the key. It should be update if
 *the key index changes. */
hax.app.visiui.Hax.prototype.setFolderContextMenu = function(contentElement,folder) {
    
    var app = this;

    var initialValues = {};
    initialValues.parentKey = hax.app.visiui.WorkspaceUI.getObjectKey(folder);
    
    contentElement.oncontextmenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        //position the window if we can
        if(event.offsetX) {
            var componentOptions = {};
            var coordInfo = {};
            coordInfo.x = event.offsetX;
            coordInfo.y = event.offsetY;
            componentOptions.coordInfo = coordInfo;
        }
        
        var contextMenu = new hax.visiui.MenuBody();
        app.populateAddChildMenu(contextMenu,initialValues,componentOptions);
        
        hax.visiui.Menu.showContextMenu(contextMenu,event);
    }
}

;

/** This is the main class of the hax application. */
hax.app.visiui.LinkManager = function() {
	//external links infrastructure
	this.linkMap = {};
}

/** This method adds links as registered by a given workspace. Links can be added and
 * removed. Removing links may or may not remove them from the page (currently
 * js links are not removed and css links are, once they are not used by any 
 * workspase. The linksLoadedCallback is optional. It is called when all links have
 * been loaded on the page.
 * The arguments "addList" and"removeList" are arrays with the entries {"link":(url),"type":("js" or "css")}
 */
hax.app.visiui.LinkManager.prototype.updateWorkspaceLinks = function(workspaceName,addList,removeList,linksLoadedCallback) {
	
	var i;
	var cnt;
	var index;
	var linkObject;
	var link;
	var type;
	var linkWorkspaces;
	
	//remove the workspace for this link
	cnt = removeList.length;
	for(i = 0; i < cnt; i++) {
		linkObject = removeList[i];
		link = linkObject.link;
		type = linkObject.type;
		linkWorkspaces = this.linkMap[link];
		if(linkWorkspaces) {
			index = linkWorkspaces.indexOf(link);
			if(index !== -1) {
				//remove the workspace from this link
				linkWorkspaces.splice(i,1);
				if(linkWorkspaces.length === 0) {
					//nobody references this link
					//try to remove it (it might not be removeable
					var linkRemoved = this.removeLinkFromPage(link,type);
					if(linkRemoved) {
						delete this.linkMap[link];
					}
				}
			}
			else {
				//workspace already removed - no action
			}
		}
		else {
			//link does not exist - no action
		}
	}
	
	//this object will call the cllback when all links are loaded
	var responseProcessor;
	if(linksLoadedCallback) {
		responseProcessor = this.getResponseProcessor(addList,linksLoadedCallback);
	}
	
	//add links
	cnt = addList.length;
	for(i = 0; i < cnt; i++) {
		linkObject = addList[i];
		link = linkObject.link;
		type = linkObject.type;
		linkWorkspaces = this.linkMap[link];
		if(linkWorkspaces) {
			//link already present on page
			index = linkWorkspaces.indexOf(link);
			if(index != -1) {
				//workspace already has link - no action
			}
			else {
				//add workspace to link
				linkWorkspaces.push(workspaceName);
			}
	
//SLOPPY!
			//not pending
			if(responseProcessor) {
				responseProcessor.getOnLoad(link)();
			}
		}
		else {
			//link must be added, and workspace added to link
			linkWorkspaces = [];
			linkWorkspaces.push(workspaceName);
			this.linkMap[link] = linkWorkspaces;
			this.addLinkToPage(link,type,responseProcessor);
		}
	}
}

hax.app.visiui.LinkManager.prototype.addLinkToPage = function(link,type,responseProcessor) {
	
	if(type === "js") {
		hax.app.visiui.LinkManager.addJsLink(link,responseProcessor)
	}
	else if(type === "css") {
		hax.app.visiui.LinkManager.addCssLink(link,responseProcessor);
	}
}

hax.app.visiui.LinkManager.prototype.removeLinkFromPage = function(link,type) {
	//for now do not remove js link, only css
	//we can not unexectue the js script
	//css does get removed
	if(type === "css") {
		hax.app.visiui.LinkManager.removeLink(link);
		return true;
	}
	else {
		return false;
	}
}

/** @private */
hax.app.visiui.LinkManager.addJsLink = function(link,responseProcessor) {

    //set the link as the element id
    var element = document.getElementById(link);
    if(!element) {
		//create link properties
		var linkProps = {};
		linkProps.id = link;
		linkProps.src = link;
		if(responseProcessor) {
			linkProps.onload = responseProcessor.getOnLoad(link);
			linkProps.onerror = responseProcessor.getOnError(link);
		}
        element = hax.visiui.createElement("script",linkProps);
        document.head.appendChild(element);
    }
	else {
		alert("THIS SHOULDN'T HAPPEN!");
	}
}

/** @private */
hax.app.visiui.LinkManager.addCssLink = function(link,onResponseProcessor) {
    //set the link as the element id
    var element = document.getElementById(link);
    if(!element) {
		//create link properties
		var linkProps = {};
		linkProps.id = link;
		linkProps.rel = "stylesheet";
		linkProps.type = "text/css";
		linkProps.href = link;
		if(onResponseProcessor) {
			linkProps.onload = onResponseProcessor.getOnLoad(link);
			linkProps.onerror = onResponseProcessor.getOnError(link);
		}
        element = hax.visiui.createElement("link",linkProps);
        document.head.appendChild(element);
    }
	else {
		alert("THIS SHOULDN'T HAPPEN!");
	}
}

/** @private */
hax.app.visiui.LinkManager.removeLink = function(link) {
    //set the link as the element id
    var element = document.getElementById(link);
    if(element) {
        document.head.removeChild(element);
    }
}

/** This returns an object that manages calling the given callback when all requested links
 * are loaded.
 * @private */
hax.app.visiui.LinkManager.prototype.getResponseProcessor = function(addList,linksLoadedCallback) {
	var links = [];
	for(var i = 0; i < addList.length; i++) {
		links[i] = addList[i].link;
	}

	var checkList = function(link) {
		var index = links.indexOf(link);
		if(index >= 0) {
			links.splice(index,1);
		}
		if(links.length === 0) {
			linksLoadedCallback();
		}
	}

	var responseProcessor = {};
	responseProcessor.getOnLoad = function(link) {
		return function() {
			console.log("link loaded: " + link);
			checkList(link);
		}
	}
	responseProcessor.getOnError = function(link) {
		return function() {
			console.log("link not loaded: " + link);
			checkList(link);
			alert("Error loading link: " + link);
		}
	}

	return responseProcessor;
}



;
/** This is a mixin that encapsulates the base functionality of a Component
 * 
 * This is not a class, but it is used for the prototype of the objects that inherit from it.
 */
hax.app.visiui.Component = {};
    
/** This is the initializer for the component. The object passed is the core object
 * associated with this component. */
hax.app.visiui.Component.init = function(workspaceUI,object,generator,options) {
    
    if(!options) {
        options = {};
    }
    
    this.workspaceUI = workspaceUI;
    this.object = object;
    this.generator = generator;
    
    this.parentContainer = this.workspaceUI.getParentContainerObject(object);
    if(!this.parentContainer) {
        throw hax.core.util.createError("Parent object not found: " + object.getFullName());
    }
    
    this.workspaceUI.registerMember(this.object,this);
    
    //inheriting objects can pass functions here to be called on cleanup
    this.cleanupActions = [];
    
    //--------------
    //create window
    //--------------
    var windowOptions = {};
    windowOptions.minimizable = true;
    windowOptions.maximizable = true;
    windowOptions.resizable = true;
    windowOptions.movable = true;
    windowOptions.frameColorClass = "visicomp_windowColor";
    windowOptions.titleBarClass = "visicomp_titleBarClass";
    this.window = new hax.visiui.WindowFrame(this.parentContainer,windowOptions);

    //------------------
    // Add menu (we will add the items later. This populates it.)
    //------------------

    var menu = this.window.getMenu();
    
    //------------------
    //set the title
    //------------------
    this.window.setTitle(this.getObject().getDisplayName());
    
    //show the window
    if(options.coordInfo) {
        this.window.setCoordinateInfo(options.coordInfo);
    }
    else {
        //set position 
        var pos = this.parentContainer.getNextWindowPosition();
        this.window.setPosition(pos[0],pos[1]);
        
        //set default size
        this.window.setSize(generator.DEFAULT_WIDTH,generator.DEFAULT_HEIGHT);
    }
    if(options.windowState) {
        this.window.setWindowState(options.windowState);
    }
    this.window.show();
    
    
    //------------------
    // Add window content
    //------------------
    
    //menu items
    this.menuItemInfoList = [];
    
    //add the standard entries
    var itemInfo = {};
    itemInfo.title = "Edit Properties";
    itemInfo.callback = hax.app.visiui.updatecomponent.getUpdateComponentCallback(this,this.generator);
    this.menuItemInfoList.push(itemInfo);
    
    var itemInfo = {};
    itemInfo.title = "Delete";
    itemInfo.callback = this.createDeleteCallback(itemInfo.title);
    this.menuItemInfoList.push(itemInfo);
    
    //let the extending object populate the frame and the menu items
	if(this.populateFrame) {
		this.populateFrame();
	}
    
    //set the menu items
    menu.setMenuItems(this.menuItemInfoList);
}

/** This method should be called if any cleanup actions are needed on delete. */
hax.app.visiui.Component.addCleanupAction = function(cleanupFunction) {
    this.cleanupActions.push(cleanupFunction);
}

//=======================
// dev
//=======================

/** This method returns the base member for this component. */
hax.app.visiui.Component.showErrorBar = function(text) {
    if(!this.errorDiv) {
        this.errorDiv = hax.visiui.createElement("div",null,
            {
                "display":"block",
                "position":"relative",
                "top":"0px",
                "backgroundColor":"red",
                "color":"white"
            });
    }
    this.errorDiv.innerHTML = text;
    this.errorBarActive = true;
	
	this.showActiveHeaders();
}

/** This method returns the base member for this component. */
hax.app.visiui.Component.hideErrorBar = function() {
	this.errorBarActive = false;
	this.showActiveHeaders();
}

/** This method returns the base member for this component. */
hax.app.visiui.Component.showSaveBar = function(onSave,onCancel) {
    if(!this.saveDiv) {
        this.saveDiv = hax.visiui.createElement("div",null,
            {
                "display":"block",
                "position":"relative",
                "top":"0px",
                "backgroundColor":"white",
				"border":"solid 1px gray",
				"padding":"3px"
            });
			
		this.saveDiv.appendChild(document.createTextNode("Edit: "));
		
		this.saveBarSaveButton = document.createElement("button");
		this.saveBarSaveButton.innerHTML = "Save";
		this.saveDiv.appendChild(this.saveBarSaveButton);
		
		this.saveDiv.appendChild(document.createTextNode(" "));

		this.saveBarCancelButton = document.createElement("button");
		this.saveBarCancelButton.innerHTML = "Cancel";
		this.saveDiv.appendChild(this.saveBarCancelButton);
    }
	
	this.saveBarSaveButton.onclick = onSave;
	this.saveBarCancelButton.onclick = onCancel;
	this.saveBarActive = true;
	
	this.showActiveHeaders();
}

/** This returns true if the user is editing, as signified by the edit bar showing. */
hax.app.visiui.Component.editActive = function() {
    return this.saveBarActive;
}

/** This method returns the base member for this component. */
hax.app.visiui.Component.hideSaveBar = function() {
    this.saveBarActive = false;	
	this.showActiveHeaders();
}

/** This method shows the active headers. 
 * @private */
hax.app.visiui.Component.showActiveHeaders = function() {
	var window = this.getWindow();
	
	var headers = [];
	if((this.errorBarActive)&&(this.errorDiv)) {
		headers.push(this.errorDiv);
	}
	if((this.saveBarActive)&&(this.saveDiv)) {
		headers.push(this.saveDiv);
	}
	
    window.loadHeaders(headers);
}

//==============================
// Public Instance Methods
//==============================

/** This method returns the base member for this component. */
hax.app.visiui.Component.getObject = function() {
    return this.object;
}

/** This method returns the workspace for this component. */
hax.app.visiui.Component.getWorkspace = function() {
    return this.object.getWorkspace();
}

/** This method returns the workspaceUI for this component. */
hax.app.visiui.Component.getWorkspaceUI = function() {
    return this.workspaceUI;
}

/** This method populates the frame for this component. */
hax.app.visiui.Component.getWindow = function() {
     return this.window;
}

/** This method sets the content element as a scrolling element. */
hax.app.visiui.Component.setScrollingContentElement = function() {
    //load the content div
    this.contentDiv = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
    this.window.setContent(this.contentDiv);
}

/** This method sets the content element as a fixed element. */
hax.app.visiui.Component.setFixedContentElement = function() {
    //load the content div
    this.contentDiv = this.window.getBody();
}

/** This method returns the content element for the windowframe for this component. */
hax.app.visiui.Component.getContentElement = function() {
     return this.contentDiv;
}

/** This serializes the component. */
hax.app.visiui.Component.toJson = function() {
    var json = {};
    json.key = this.getObject().getFullName();
    json.type = this.generator.uniqueName;
    
    json.coordInfo = this.window.getCoordinateInfo();
    json.windowState = this.window.getWindowState();
    
    if(this.writeToJson) {
        this.writeToJson(json);
    }
    
    return json;
}

//==============================
// Protected Instance Methods
//==============================

//This method should be populated by an extending object. It should return a json object.
//** This serializes the table component. */
//hax.app.visiui.Component.prototype.writeToJson = function(json);

//This method should be populated by an extending object iof it needs to add any UI elements
// to the frame.
//** This method populates the frame for this component. */
//hax.app.visiui.Component.populateFrame = function();

/** This method should include an needed functionality to clean up after a delete. */
hax.app.visiui.Component.onDelete = function() {
    //remove the UI element
    var componentWindow = this.getWindow();
    componentWindow.deleteWindow();
    
    //execute cleanup actions
    for(var i = 0; i < this.cleanupActions.length; i++) {
        this.cleanupActions[i]();
    }
}

/** This method should include an needed functionality to clean up after a delete. */
hax.app.visiui.Component.memberMoved = function(newParentContainer) {
        //move the window to the proper parent container
    this.parenContainer = newParentContainer;
    this.window.changeParent(newParentContainer);
    this.updateTitle();
}

/** This method extends the member udpated function from the base.
 * @protected */    
hax.app.visiui.Component.memberUpdated = function() {
    this.updateTitle();
}

/** This method makes sure the window title is up to date.
 * @private */    
hax.app.visiui.Component.updateTitle = function() {
    //make sure the title is up to data
    var window = this.getWindow();
    if(window) {
        var member = this.getObject();
        var displayName = member.getDisplayName();
        var windowTitle = window.getTitle();
        if(windowTitle !== displayName) {
            window.setTitle(displayName);
        }
    }
}

/** This method is used for setting initial values in the property dialog. 
 * If there are additional property lines, in the generator, this method should
 * be extended to give the values of those properties too. */
hax.app.visiui.Component.getPropertyValues = function() {
    
    var member = this.object;
    
    var values = {};
    values.name = member.getName();
    values.parentKey = hax.app.visiui.WorkspaceUI.getObjectKey(member.getParent());
    
    if(this.generator.addPropFunction) {
        this.generator.addPropFunction(member,values);
    }
    return values;
}

/** This method is used for updating property values from the property dialog. 
 * If there are additional property lines, in the generator, this method should
 * be extended to edit the values of those properties too. */
hax.app.visiui.Component.updatePropertyValues = function(oldValues,newValues) {
    var actionResponse = new hax.core.ActionResponse();
    var recalculateList = [];
    var member = this.object;
    
    try {
        if((oldValues.name !== newValues.name)||(oldValues.parentKey !== newValues.parentKey)) {
            var parent = this.workspaceUI.getObjectByKey(newValues.parentKey);
            hax.core.movemember.moveMember(member,newValues.name,parent,recalculateList);
        }

        if(this.generator.updatePropHandler) {
            this.generator.updatePropHandler(member,oldValues,newValues,recalculateList);
        }
        
        //recalculate
        hax.core.calculation.callRecalculateList(recalculateList,actionResponse);
        
        hax.core.updatemember.fireUpdatedEventList(recalculateList);
    }
    catch(error) {
        //unknown application error
        var actionError = hax.core.ActionError.processException(error,"AppException",true);
        actionResponse.addError(actionError);
    }
    
    return actionResponse;
}

//=============================
// Action UI Entry Points
//=============================

/** This method creates a callback for deleting the component. 
 *  @private */
hax.app.visiui.Component.createDeleteCallback = function() {
    var object = this.getObject();
    return function() {
        var doDelete = confirm("Are you sure you want to delete this object?");
        if(!doDelete) {
            return;
        }
        
        //delete the object - the component we be deleted after the delete event received
        var actionResponse = hax.core.deletemember.deleteMember(object);
        if(!actionResponse.getSuccess()) {
            //show an error message
            var msg = actionResponse.getErrorMsg();
            alert(msg);
        }
    }
}

//======================================
// All components should have a generator to register the component, as below
//======================================
//
//hax.app.visiui.JsonTableComponent.generator = {};
//hax.app.visiui.JsonTableComponent.generator.displayName = "JSON Table";
//hax.app.visiui.JsonTableComponent.generator.uniqueName = "hax.app.visiui.JsonTableComponent";
//hax.app.visiui.JsonTableComponent.generator.createComponent = hax.app.visiui.JsonTableComponent.createComponent;
//hax.app.visiui.JsonTableComponent.generator.createComponentFromJson = hax.app.visiui.JsonTableComponent.createComponentFromJson;
//hax.app.visiui.JsonTableComponent.generator.DEFAULT_WIDTH = 200;
//hax.app.visiui.JsonTableComponent.generator.DEFAULT_HEIGHT = 200;;
/** This is a mixin that encapsulates the base functionality of a Component
 *that edits a table. This mixin requires the object be a component.
 * 
 * This is not a class, but it is used for the prototype of the objects that inherit from it.
 */
hax.app.visiui.TableEditComponent = {};

/** This is the initializer for the component. The object passed is the core object
 * associated with this component. */
hax.app.visiui.TableEditComponent.init = function(viewTypes,defaultView,optionalClearFunctionOnBlankInfo) {
	
	this.viewTypes = viewTypes;
	this.defaultView = defaultView;
	
	this.initUI();
	
	//this.viewModeElement
    //this.viewType
    //this.viewModeElementShowing
    //this.select
	
	this.clearFunctionOnBlankInfo = optionalClearFunctionOnBlankInfo;
	this.clearFunctionActive = false;
	this.clearFunctionCallback = null;
    
    //add a cleanup action to the base component - component must already be initialized
    var instance = this;
    var cleanupAction = function() {
        instance.destroy();
    }
    this.addCleanupAction(cleanupAction);

}

/** This value is used as the background color when an editor is read only. */
hax.app.visiui.TableEditComponent.NO_EDIT_BACKGROUND_COLOR = "#f4f4f4";

/** This method populates the frame for this component. 
 * @protected */
hax.app.visiui.TableEditComponent.setViewType = function(viewType) {
	//return if there is no change
	if(this.viewType === viewType) return false;
    
    //check if we are editing
    if(this.editActive()) {
        alert("You must save or cancel the edit session to change the view mode.");
        return false;
    }
	
	//if there is an old view, remove it
	if(this.viewModeElement) {
		this.showModeElement(null);
	}
    
    this.viewModeElement = this.getViewModeElement(viewType);
    this.viewType = viewType;
    
    return true;
}

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
//hax.app.visiui.TableEditComponent.getViewModeElement = function(viewType);

//this function will update the view shown in the dropdown
hax.app.visiui.TableEditComponent.updateViewDropdown = function(viewType) {
    if(!viewType) {
        viewType = this.defaultView;
    }
    this.select.value = viewType;
}

/** This method updates the table data 
 * @private */    
hax.app.visiui.TableEditComponent.memberUpdated = function() {
    //call the base function
    hax.app.visiui.Component.memberUpdated.call(this);
    
    var object = this.getObject();
    if(object.hasError()) {
        var errorMsg = "";
        var actionErrors = object.getErrors();
        for(var i = 0; i < actionErrors.length; i++) {
            errorMsg += actionErrors[i].msg + "\n";
        }
        
        this.showErrorBar(errorMsg);
    }
    else {   
        this.hideErrorBar();
    }
        
    if(this.viewModeElementShowing !== this.viewModeElement) {
        this.showModeElement(this.viewModeElement);
    }

    var editable = ((this.viewModeElement.isData === false)||(!object.hasCode()));

    this.viewModeElement.showData(editable);
	
	//add the clear function menu item if needed
	if(this.clearFunctionOnBlankInfo) {
	
		if(object.hasCode()) {
			if(!this.clearFunctionActive) {
				var menu = this.getWindow().getMenu();
				
				if(!this.clearFunctionCallback) {
					this.clearFunctionCallback = this.getClearFunctionCallback();
				}
				
				menu.addCallbackMenuItem(this.clearFunctionOnBlankInfo.menuLabel,this.clearFunctionCallback);
				this.clearFunctionActive = true;
			}
		}
		else {
			if(this.clearFunctionActive) {
				var menu = this.getWindow().getMenu();
				menu.removeMenuItem(this.clearFunctionOnBlankInfo.menuLabel);
				this.clearFunctionActive = false;
			}
		}
	}
}

hax.app.visiui.TableEditComponent.getClearFunctionCallback = function() {
	var table = this.getObject();
	var blankDataValue = this.clearFunctionOnBlankInfo.dataValue;
    return function() {
        var actionResponse = hax.core.updatemember.updateData(table,blankDataValue); 
        if(!actionResponse.getSuccess()) {
            alert(actionResponse.getErrorMsg());
        }
    }
}

/** This method should be called to set up the component ui for edit mode. 
 * @protected */
hax.app.visiui.TableEditComponent.startEditUI = function(onSave,onCancel) {
    this.select.disabled = true;
    this.showSaveBar(onSave,onCancel);
}

/** This method populates the frame for this component. 
 * @protected */
hax.app.visiui.TableEditComponent.endEditUI = function() {
    this.hideSaveBar();
    this.select.disabled = false;
}
/** This method populates the frame for this component. 
 * @protected */
hax.app.visiui.TableEditComponent.initUI = function() {
	
	this.setFixedContentElement();
	
	//create the view selection ui
	this.select = hax.visiui.createElement("select",null,{
        "marginRight":"3px",
        "backgroundColor":"transparent"
    });
    
    for(var i = 0; i < this.viewTypes.length; i++) {
        var entry = this.viewTypes[i];
        this.select.add(hax.visiui.createElement("option",{"text":entry}));
    }
    
    //create on functions
    var instance = this;
    var onViewSet = function(event) {
        var success = instance.setViewType(instance.select.value);
        if(success) {
            instance.memberUpdated();
        }
        else {
            //make sure correct view type is displayed
            instance.updateViewDropdown(this.viewType);
        }
        return success;
    }
    
    this.select.onchange = onViewSet;
   
    //add the view select to the title bar
    this.window.addRightTitleBarElement(this.select);
    
    this.setViewType(this.defaultView);
    this.updateViewDropdown();
}

/** @private */
hax.app.visiui.TableEditComponent.showModeElement = function(viewModeElement) {
    
	var contentDiv = this.getContentElement();
	hax.core.util.removeAllChildren(contentDiv);
	
    if(viewModeElement) {
		var viewDiv = viewModeElement.getElement();
		contentDiv.appendChild(viewDiv);
	}
	
	if(this.viewModeElementShowing) {
		this.viewModeElementShowing.destroy();
	}
	this.viewModeElementShowing = viewModeElement;
}

/** @protected */
hax.app.visiui.TableEditComponent.destroy = function() {
    if(this.viewModeElement) {
        this.viewModeElement.destroy();
    }
}
;
/** This class manages the user interface for a workspace object. */
hax.app.visiui.WorkspaceUI = function() {

    this.workspace = null;
	
    //properties
	this.app = null;
    this.tab = null;
    this.componentMap = {};
    this.activeFolderName = null;
   
    this.jsLinkArray = [];
    this.cssLinkArray = [];
}

/** This sets the application. It must be done before the workspace is set. */
hax.app.visiui.WorkspaceUI.prototype.setApp = function(app,tab) {
    this.app = app;
    this.tab = tab;
}

/** This gets the application instance. */
hax.app.visiui.WorkspaceUI.prototype.getApp = function() {
    return this.app;
}

 /** This method sets the workspace. The argument componentsJson should be included
  * if the workspace is not empty, such as when opening a existing workspace. It
  * contains the data for the component associated with each workspace member. For 
  * a new empty workspace the componentsJson should be omitted. */
hax.app.visiui.WorkspaceUI.prototype.setWorkspace = function(workspace, componentsJson) {   
    this.workspace = workspace; 
    
    //set up the root folder
    var rootFolder = this.workspace.getRoot();
    this.registerMember(rootFolder,null);
    this.addComponentContainer(rootFolder,this.tab);
  
    //load components from json if present
    if(componentsJson) {
        this.loadFolderComponentContentFromJson(rootFolder,componentsJson);
    }
    
    //listeners
    var instance = this;
    
    //add a member updated listener
    var memberUpdatedCallback = function(memberObject) {
        instance.memberUpdated(memberObject);
    }
    this.workspace.addListener(hax.core.updatemember.MEMBER_UPDATED_EVENT, memberUpdatedCallback);
	
	//add child deleted listener
    var childDeletedListener = function(fullName) {
        instance.childDeleted(fullName);
    }
    this.workspace.addListener(hax.core.deletemember.MEMBER_DELETED_EVENT, childDeletedListener);
    var childMovedListener = function(moveInfo) {
        instance.childMoved(moveInfo);
    }
    this.workspace.addListener(hax.core.movemember.MEMBER_MOVED_EVENT, childMovedListener);
    
    //add context menu to create childrent
    var contentElement = this.tab.getContainerElement();
    var app = this.getApp();
    app.setFolderContextMenu(contentElement,rootFolder);
    
}

/** This method gets the workspace object. */
hax.app.visiui.WorkspaceUI.prototype.getWorkspace = function() {
    return this.workspace;
}

/** This method gets the component associated with a member object. */
hax.app.visiui.WorkspaceUI.prototype.getComponent = function(object) {
    var key = hax.app.visiui.WorkspaceUI.getObjectKey(object);
	var componentInfo = this.componentMap[key];
	if(componentInfo) {
		return componentInfo.component;
	}
	else {
		return null;
	}
}

/** This returns the map of component objects. */
hax.app.visiui.WorkspaceUI.prototype.getFolderList = function() {
	var folderList = []; 
    for(var key in this.componentMap) {
		var componentInfo = this.componentMap[key];
		if(componentInfo.parentContainer) { 
			folderList.push(key);
		}
    }
    return folderList;
}

hax.app.visiui.WorkspaceUI.prototype.getParentContainerObject = function(object) {
    var parent = object.getParent();
    
    //get parent component info
    var parentKey = hax.app.visiui.WorkspaceUI.getObjectKey(parent);
    var parentComponentInfo = this.componentMap[parentKey];
    if(!parentComponentInfo.parentContainer) {
        throw hax.core.util.createError("Parent container not found!");
    }
    return parentComponentInfo.parentContainer;
}

/** This method registers a member data object and its optional component object.
 * for each folder, and only folders at this point, the mehod addComponentContainer
 * should also be called to set the container for the children of this folder. */
hax.app.visiui.WorkspaceUI.prototype.registerMember = function(object,component) {
    
    //make sure this is for us
    if(object.getWorkspace() !== this.workspace) {
        throw hax.core.util.createError("Component registered in wrong workspace: " + object.getFullName());
    }
    
    //store the ui object
	var key = hax.app.visiui.WorkspaceUI.getObjectKey(object);
	
	if(this.componentMap[key]) {
		//already exists! (we need to catch this earlier if we want it to not be fatal. But we should catch it here too.)
        throw hax.core.util.createError("There is already a component with the given name.",true);
	}
	
    var componentInfo = {};
    componentInfo.object = object;
	componentInfo.component = component;
	
    this.componentMap[key] = componentInfo;
    
}

/** This method sets the parent for the given component. */
hax.app.visiui.WorkspaceUI.prototype.addComponentContainer = function(object,parentContainer) {
    
    //store the ui object
	var key = hax.app.visiui.WorkspaceUI.getObjectKey(object);
	
    var componentInfo = this.componentMap[key];
    if(!componentInfo) {
		alert("Unknown error - component info not found: " + key);
		return;
	}
	componentInfo.parentContainer = parentContainer;
}
	

/** This method responds to a member updated. */
hax.app.visiui.WorkspaceUI.prototype.memberUpdated = function(memberObject) {
    //store the ui object
	var key = memberObject.getFullName();
	
	var componentInfo = this.componentMap[key];
	if((componentInfo)&&(componentInfo.component)) {
        componentInfo.component.memberUpdated();
    }
}

/** This method responds to a "new" menu event. */
hax.app.visiui.WorkspaceUI.prototype.childDeleted = function(deleteInfo) {
	
	//store the ui object
	var key = deleteInfo.fullName;
	
	var componentInfo = this.componentMap[key];
	delete this.componentMap[key];

	if((componentInfo)&&(componentInfo.component)) {
        //do any needed cleanup
        componentInfo.component.onDelete();
	}
}

/** This method responds to a "new" menu event. */
hax.app.visiui.WorkspaceUI.prototype.childMoved = function(moveInfo) {
    
    var componentInfo = this.componentMap[moveInfo.oldFullName];
    delete this.componentMap[moveInfo.oldFullName];
    this.componentMap[moveInfo.newFullName] = componentInfo;
    
    //update the component
	if((componentInfo)&&(componentInfo.component)) {
        var parentContainer = this.getParentContainerObject(componentInfo.object);
        componentInfo.component.memberMoved(parentContainer);
    }
}

hax.app.visiui.WorkspaceUI.getObjectKey = function(object) {
	return object.getFullName();
}

hax.app.visiui.WorkspaceUI.prototype.getObjectByKey = function(key) {
    var componentInfo = this.componentMap[key];
    if(componentInfo) {
        return componentInfo.object;
    }
    else {
        return null;
    }
}

hax.app.visiui.WorkspaceUI.prototype.getComponentByKey = function(key) {
    var componentInfo = this.componentMap[key];
    if(componentInfo) {
        return componentInfo.component;
    }
    else {
        return null;
    }
}

/** This method gets the workspace object. */
hax.app.visiui.WorkspaceUI.prototype.close = function() {
    //delete all the components - to make sure the are cleaned up
    for(var key in this.componentMap) {
        var componentInfo = this.componentMap[key];
        if((componentInfo)&&(componentInfo.component)) {
            componentInfo.component.onDelete();
        }
    }
}

//====================================
// open and save methods
//====================================

hax.app.visiui.WorkspaceUI.prototype.toJson = function() {
    var json = {};
    json.name = this.workspace.getName();
    json.fileType = "hax workspace";
    
    json.jsLinks = this.jsLinkArray;
    json.cssLinks = this.cssLinkArray;
    
    json.workspace = this.workspace.toJson();
    
    var rootFolder = this.workspace.getRoot();
    json.components = this.getFolderComponentContentJson(rootFolder);
    
    return json;
}

hax.app.visiui.WorkspaceUI.prototype.getFolderComponentContentJson = function(folder) {
    var json = {};
    var childMap = folder.getChildMap();
	for(var key in childMap) {
		var child = childMap[key];
        
		//get the object map for the workspace
		var childComponent = this.getComponent(child);
		
		//get the component for this child
		var name = child.getName();
		json[name] = childComponent.toJson();
	}
    return json;
}

hax.app.visiui.WorkspaceUI.prototype.loadFolderComponentContentFromJson = function(folder,json) {
	for(var key in json) {
		var childJson = json[key];
		var childMember = folder.lookupChild(key);	
		this.loadComponentFromJson(childMember,childJson);
	}
}

hax.app.visiui.WorkspaceUI.prototype.loadComponentFromJson = function(member,json) {
    var componentType = json.type;
    var generator = this.app.getComponentGenerator(componentType);
	if(generator) {
        generator.createComponentFromJson(this,member,json);
    }
    else {
        throw hax.core.util.createError("Component type not found: " + componentType);
    }
}


//========================================
// Links
//========================================

hax.app.visiui.WorkspaceUI.prototype.getJsLinks = function() {
	return this.jsLinkArray;
}

//GET RUID OF NAME ARG!!!
hax.app.visiui.WorkspaceUI.prototype.setLinks = function(newJsLinkArray,newCssLinkArray,onLinksLoaded,name) {
    //update the page links
    var oldJsLinkArray = this.jsLinkArray;
	var oldCssLinkArray = this.cssLinkArray;
	var addList = [];
	var removeList = [];
	
    this.createLinkAddRemoveList(newJsLinkArray,oldJsLinkArray,"js",addList,removeList);
	this.createLinkAddRemoveList(newCssLinkArray,oldCssLinkArray,"css",addList,removeList);
	
    this.jsLinkArray = newJsLinkArray;
	this.cssLinkArray = newCssLinkArray;
	this.app.updateWorkspaceLinks(name,addList,removeList,onLinksLoaded);;
}

hax.app.visiui.WorkspaceUI.prototype.getCssLinks = function() {
	return this.cssLinkArray;
}

/** This method determins which links are new, which are old and which are removed.  
 * @private */
hax.app.visiui.WorkspaceUI.prototype.createLinkAddRemoveList = function(linkArray,oldLinkArray,type,addList,removeList) { 
    
    var newLinks = {};
    var i;
    var link;
    
    //add the new links
    for(i = 0; i < linkArray.length; i++) {
        link = linkArray[i];
        newLinks[link] = true;
    }
    
    //fiure out which are new and which are outdated
    for(i = 0; i < oldLinkArray.length; i++) {
        link = oldLinkArray[i];
        if(!newLinks[link]) {
			//this link has been removed
            removeList.push({"link":link,"type":type});
        }
		else {
			//flag that this does not need to be added
			newLinks[link] = false;
		}
    }
	
	//put the new links to the add list
	for(link in newLinks) {
		if(newLinks[link]) {
			addList.push({"link":link,"type":type});
		}
	}
}
    ;
/** This component represents a table object. */
hax.app.visiui.FolderComponent = function(workspaceUI,folder,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,folder,hax.app.visiui.FolderComponent.generator,componentJson);
    hax.visiui.ParentContainer.init.call(this,this.getContentElement(),this.getWindow());
	hax.visiui.ParentHighlighter.init.call(this,this.getContentElement());
    
    //register this folder as a parent container
    workspaceUI.addComponentContainer(folder,this);
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.FolderComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.FolderComponent,hax.visiui.ParentContainer);
hax.core.util.mixin(hax.app.visiui.FolderComponent,hax.visiui.ParentHighlighter);

//----------------------
// ParentContainer Methods
//----------------------

/** This method must be implemented in inheriting objects. */
hax.app.visiui.FolderComponent.prototype.getContentIsShowing = function() {
    return this.getWindow().getContentIsShowing();
}

//==============================
// Protected and Private Instance Methods
//==============================

/** This serializes the table component. */
hax.app.visiui.FolderComponent.prototype.writeToJson = function(json) {
    var folder = this.getObject();
    var workspaceUI = this.getWorkspaceUI();
    json.children = workspaceUI.getFolderComponentContentJson(folder);
}

/** This method populates the frame for this component. 
 * @protected */
hax.app.visiui.FolderComponent.prototype.populateFrame = function() {
	this.setScrollingContentElement();
    
    //add context menu to create childrent
    var contentElement = this.getContentElement();
    var folder = this.getObject();
    var app = this.getWorkspaceUI().getApp();
    app.setFolderContextMenu(contentElement,folder);
    
}


//======================================
// Static methods
//======================================

//add table listener
hax.app.visiui.FolderComponent.createComponent = function(workspaceUI,data,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
    var json = {};
    json.name = data.name;
    json.type = hax.core.Folder.generator.type;
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var folder = actionResponse.member;
    if(folder) {       
        var folderComponent = new hax.app.visiui.FolderComponent(workspaceUI,folder,componentOptions);
        actionResponse.component = folderComponent;
    }
    return actionResponse;
}

hax.app.visiui.FolderComponent.createComponentFromJson = function(workspaceUI,member,componentJson) {
    var folderComponent = new hax.app.visiui.FolderComponent(workspaceUI,member,componentJson);
    if((componentJson)&&(componentJson.children)) {
        workspaceUI.loadFolderComponentContentFromJson(member,componentJson.children);
    }
    
    return folderComponent;
}


//======================================
// This is the component generator, to register the component
//======================================

hax.app.visiui.FolderComponent.generator = {};
hax.app.visiui.FolderComponent.generator.displayName = "Folder";
hax.app.visiui.FolderComponent.generator.uniqueName = "hax.app.visiui.FolderComponent";
hax.app.visiui.FolderComponent.generator.createComponent = hax.app.visiui.FolderComponent.createComponent;
hax.app.visiui.FolderComponent.generator.createComponentFromJson = hax.app.visiui.FolderComponent.createComponentFromJson;
hax.app.visiui.FolderComponent.generator.DEFAULT_WIDTH = 500;
hax.app.visiui.FolderComponent.generator.DEFAULT_HEIGHT = 500;;
/** This component represents a json table object. */
hax.app.visiui.JsonTableComponent = function(workspaceUI,table,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,table,hax.app.visiui.JsonTableComponent.generator,componentJson);
    hax.app.visiui.TableEditComponent.init.call(this,
		hax.app.visiui.JsonTableComponent.VIEW_MODES,
        hax.app.visiui.JsonTableComponent.DEFAULT_VIEW,
		hax.app.visiui.JsonTableComponent.BLANK_DATA_VALUE_INFO);
	
    this.memberUpdated();
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.JsonTableComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.JsonTableComponent,hax.app.visiui.TableEditComponent);

//==============================
// Protected and Private Instance Methods
//==============================

hax.app.visiui.JsonTableComponent.VIEW_PLAIN_TEXT = "Text";
hax.app.visiui.JsonTableComponent.VIEW_JSON_TEXT = "JSON";
hax.app.visiui.JsonTableComponent.VIEW_FORM = "Form";
hax.app.visiui.JsonTableComponent.VIEW_CODE = "Formula";
hax.app.visiui.JsonTableComponent.VIEW_SUPPLEMENTAL_CODE = "Private";

hax.app.visiui.JsonTableComponent.VIEW_MODES = [
    hax.app.visiui.JsonTableComponent.VIEW_PLAIN_TEXT,
    hax.app.visiui.JsonTableComponent.VIEW_JSON_TEXT,
    hax.app.visiui.JsonTableComponent.VIEW_FORM,
    hax.app.visiui.JsonTableComponent.VIEW_CODE,
    hax.app.visiui.JsonTableComponent.VIEW_SUPPLEMENTAL_CODE
];

//hax.app.visiui.JsonTableComponent.DEFAULT_VIEW = hax.app.visiui.JsonTableComponent.VIEW_FORM;
hax.app.visiui.JsonTableComponent.DEFAULT_VIEW = hax.app.visiui.JsonTableComponent.VIEW_PLAIN_TEXT;

hax.app.visiui.JsonTableComponent.BLANK_DATA_VALUE_INFO = {
	"dataValue":"",
	"menuLabel":"Clear Formula"
};

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
hax.app.visiui.JsonTableComponent.prototype.getViewModeElement = function(viewType) {
	
	//create the new view element;
	switch(viewType) {
        case hax.app.visiui.JsonTableComponent.VIEW_PLAIN_TEXT:
            return new hax.app.visiui.AceDataMode(this,false);
            
		case hax.app.visiui.JsonTableComponent.VIEW_JSON_TEXT:
			return new hax.app.visiui.AceDataMode(this,true);
			
		case hax.app.visiui.JsonTableComponent.VIEW_FORM:
			return new hax.app.visiui.FormDataMode(this);
			
		case hax.app.visiui.JsonTableComponent.VIEW_CODE:
			return new hax.app.visiui.AceCodeMode(this,hax.app.visiui.JsonTableComponent.BLANK_DATA_VALUE_INFO,hax.app.visiui.JsonTableComponent.editorCodeWrapper);
			
		case hax.app.visiui.JsonTableComponent.VIEW_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceSupplementalMode(this);
			
		default:
//temporary error handling...
			alert("unrecognized view element!");
			return null;
	}
}

//======================================
// Static methods
//======================================


hax.app.visiui.JsonTableComponent.createComponent = function(workspaceUI,data,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
    var json = {};
    json.name = data.name;
    json.type = hax.core.JsonTable.generator.type;
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var table = actionResponse.member;
    if(table) {
        var tableComponent = new hax.app.visiui.JsonTableComponent(workspaceUI,table,componentOptions);
        actionResponse.component = tableComponent;
    }
    return actionResponse;
}


hax.app.visiui.JsonTableComponent.createComponentFromJson = function(workspaceUI,member,componentJson) {
    var tableComponent = new hax.app.visiui.JsonTableComponent(workspaceUI,member,componentJson);
    return tableComponent;
}

//======================================
// This is the component generator, to register the component
//======================================

hax.app.visiui.JsonTableComponent.generator = {};
hax.app.visiui.JsonTableComponent.generator.displayName = "Data Table";
hax.app.visiui.JsonTableComponent.generator.uniqueName = "hax.app.visiui.JsonTableComponent";
hax.app.visiui.JsonTableComponent.generator.createComponent = hax.app.visiui.JsonTableComponent.createComponent;
hax.app.visiui.JsonTableComponent.generator.createComponentFromJson = hax.app.visiui.JsonTableComponent.createComponentFromJson;
hax.app.visiui.JsonTableComponent.generator.DEFAULT_WIDTH = 200;
hax.app.visiui.JsonTableComponent.generator.DEFAULT_HEIGHT = 200;

//======================================
// This is a code wrapper so the user works with the formula rather than the function body
//======================================

hax.app.visiui.JsonTableComponent.editorCodeWrapper = {};

hax.app.visiui.JsonTableComponent.editorCodeWrapper.FUNCTION_PREFIX = "var value;\n";
hax.app.visiui.JsonTableComponent.editorCodeWrapper.FUNCTION_SUFFIX = "\nreturn value;\n\n";

hax.app.visiui.JsonTableComponent.editorCodeWrapper.displayName = "Formula";

hax.app.visiui.JsonTableComponent.editorCodeWrapper.wrapCode = function(formula) { 
    return hax.app.visiui.JsonTableComponent.editorCodeWrapper.FUNCTION_PREFIX + formula + 
        hax.app.visiui.JsonTableComponent.editorCodeWrapper.FUNCTION_SUFFIX;
}

hax.app.visiui.JsonTableComponent.editorCodeWrapper.unwrapCode = function(functionBody) {
	if((functionBody == null)||(functionBody.length = 0)) return "";
	
    var formula = functionBody.replace("var value;","");
    formula = formula.replace("return value;","");
    return formula.trim();
}

;

/** This component represents a json table object. */
hax.app.visiui.GridTableComponent = function(workspaceUI,table,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,table,hax.app.visiui.GridTableComponent.generator,componentJson);
	hax.app.visiui.TableEditComponent.init.call(this,
		hax.app.visiui.GridTableComponent.VIEW_MODES,
		hax.app.visiui.GridTableComponent.DEFAULT_VIEW,
		hax.app.visiui.GridTableComponent.BLANK_DATA_VALUE_INFO
	);
    
    this.memberUpdated();
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.GridTableComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.GridTableComponent,hax.app.visiui.TableEditComponent);

//==============================
// Protected and Private Instance Methods
//==============================

hax.app.visiui.GridTableComponent.VIEW_GRID = "Grid";
hax.app.visiui.GridTableComponent.VIEW_CODE = "Formula";
hax.app.visiui.GridTableComponent.VIEW_SUPPLEMENTAL_CODE = "Private";

hax.app.visiui.GridTableComponent.VIEW_MODES = [
	hax.app.visiui.GridTableComponent.VIEW_GRID,
    hax.app.visiui.GridTableComponent.VIEW_CODE,
    hax.app.visiui.GridTableComponent.VIEW_SUPPLEMENTAL_CODE
];

hax.app.visiui.GridTableComponent.BLANK_DATA_VALUE_INFO = {
	"dataValue":[[null]],
	"menuLabel":"Clear Formula"
};

hax.app.visiui.GridTableComponent.DEFAULT_VIEW = hax.app.visiui.GridTableComponent.VIEW_GRID;

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
hax.app.visiui.GridTableComponent.prototype.getViewModeElement = function(viewType) {
	
	//create the new view element;
	switch(viewType) {
			
		case hax.app.visiui.GridTableComponent.VIEW_CODE:
			return new hax.app.visiui.AceCodeMode(this,hax.app.visiui.GridTableComponent.BLANK_DATA_VALUE_INFO,hax.app.visiui.JsonTableComponent.editorCodeWrapper);
			
		case hax.app.visiui.GridTableComponent.VIEW_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceSupplementalMode(this);
			
		case hax.app.visiui.GridTableComponent.VIEW_GRID:
			return new hax.app.visiui.HandsonGridMode(this);
			
		default:
//temporary error handling...
			alert("unrecognized view element!");
			return null;
	}
}

//======================================
// Static methods
//======================================


hax.app.visiui.GridTableComponent.createComponent = function(workspaceUI,data,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
    var json = {};
    json.name = data.name;
    json.type = hax.core.JsonTable.generator.type;
	json.updateData = {};
	json.updateData.data = [[""]]; //empty single cell
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var table = actionResponse.member;
    if(table) {
        var tableComponent = new hax.app.visiui.GridTableComponent(workspaceUI,table,componentOptions);
        actionResponse.component = tableComponent;
    }
    return actionResponse;
}


hax.app.visiui.GridTableComponent.createComponentFromJson = function(workspaceUI,member,componentJson) {
    var tableComponent = new hax.app.visiui.GridTableComponent(workspaceUI,member,componentJson);
    return tableComponent;
}

//======================================
// This is the component generator, to register the component
//======================================

hax.app.visiui.GridTableComponent.generator = {};
hax.app.visiui.GridTableComponent.generator.displayName = "Grid Table";
hax.app.visiui.GridTableComponent.generator.uniqueName = "hax.app.visiui.GridTableComponent";
hax.app.visiui.GridTableComponent.generator.createComponent = hax.app.visiui.GridTableComponent.createComponent;
hax.app.visiui.GridTableComponent.generator.createComponentFromJson = hax.app.visiui.GridTableComponent.createComponentFromJson;
hax.app.visiui.GridTableComponent.generator.DEFAULT_WIDTH = 200;
hax.app.visiui.GridTableComponent.generator.DEFAULT_HEIGHT = 200;

//======================================
// Use the json table code wrapper
//======================================

//external links
//https://handsontable.com/bower_components/handsontable/dist/handsontable.full.js
//https://handsontable.com/bower_components/handsontable/dist/handsontable.full.css


;
/** This component represents a table object. */
hax.app.visiui.FunctionComponent = function(workspaceUI, functionObject, componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,functionObject,hax.app.visiui.FunctionComponent.generator,componentJson);
    hax.app.visiui.TableEditComponent.init.call(this,
		hax.app.visiui.FunctionComponent.VIEW_MODES,
        hax.app.visiui.FunctionComponent.DEFAULT_VIEW);
    
    this.memberUpdated();
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.FunctionComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.FunctionComponent,hax.app.visiui.TableEditComponent);

//==============================
// Protected and Private Instance Methods
//==============================

hax.app.visiui.FunctionComponent.VIEW_CODE = "Code";
hax.app.visiui.FunctionComponent.VIEW_SUPPLEMENTAL_CODE = "Private";

hax.app.visiui.FunctionComponent.VIEW_MODES = [
    hax.app.visiui.FunctionComponent.VIEW_CODE,
    hax.app.visiui.FunctionComponent.VIEW_SUPPLEMENTAL_CODE
];

hax.app.visiui.FunctionComponent.DEFAULT_VIEW = hax.app.visiui.FunctionComponent.VIEW_CODE;

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
hax.app.visiui.FunctionComponent.prototype.getViewModeElement = function(viewType) {
	
	//create the new view element;
	switch(viewType) {
			
		case hax.app.visiui.FunctionComponent.VIEW_CODE:
			return new hax.app.visiui.AceCodeMode(this,false);
			
		case hax.app.visiui.FunctionComponent.VIEW_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceSupplementalMode(this);
			
		default:
//temporary error handling...
			alert("unrecognized view element!");
			return null;
	}
}

//======================================
// Static methods
//======================================

//create component call. data includes name and potentially other info
hax.app.visiui.FunctionComponent.createComponent = function(workspaceUI,data,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
    var json = {};
    json.name = data.name;
    if(data.argListString) {
        var argList = hax.app.visiui.FunctionComponent.parseStringArray(data.argListString);
        json.updateData = {};
        json.updateData.argList = argList;
    }
    json.type = hax.core.FunctionTable.generator.type;
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var functionObject = actionResponse.member;
    if(functionObject) {
        var functionComponent = new hax.app.visiui.FunctionComponent(workspaceUI,functionObject,componentOptions);
        actionResponse.component = functionComponent;
    }
    return actionResponse;
}

hax.app.visiui.FunctionComponent.createComponentFromJson = function(workspaceUI,member,componentJson) {
    var functionComponent = new hax.app.visiui.FunctionComponent(workspaceUI,member,componentJson);
    return functionComponent;
}

/** This method extends the base method to get the property values
 * for the property edit dialog. */
hax.app.visiui.FunctionComponent.addPropValues = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    return values;
}

hax.app.visiui.FunctionComponent.propUpdateHandler = function(member,oldValues,newValues,recalculateList) {
    if(oldValues.argListString !== newValues.argListString) {
        var newArgList = hax.app.visiui.FunctionComponent.parseStringArray(newValues.argListString);
        var functionBody = member.getFunctionBody();
        var supplementalCode = member.getSupplementalCode();

        hax.core.updatemember.updateCode(member,
            newArgList,
            functionBody,
            supplementalCode,
            recalculateList);
    }
}

hax.app.visiui.FunctionComponent.parseStringArray = function(argListString) {
    var argList = argListString.split(",");
    for(var i = 0; i < argList.length; i++) {
        argList[i] = argList[i].trim();
    }
    return argList;
}

//======================================
// This is the component generator, to register the component
//======================================

hax.app.visiui.FunctionComponent.generator = {};
hax.app.visiui.FunctionComponent.generator.displayName = "Function";
hax.app.visiui.FunctionComponent.generator.uniqueName = "hax.app.visiui.FunctionComponent";
hax.app.visiui.FunctionComponent.generator.createComponent = hax.app.visiui.FunctionComponent.createComponent;
hax.app.visiui.FunctionComponent.generator.createComponentFromJson = hax.app.visiui.FunctionComponent.createComponentFromJson;
hax.app.visiui.FunctionComponent.generator.DEFAULT_WIDTH = 200;
hax.app.visiui.FunctionComponent.generator.DEFAULT_HEIGHT = 200;

hax.app.visiui.FunctionComponent.generator.propertyDialogLines = [
    {
        "type":"inputElement",
        "heading":"Arg List: ",
        "resultKey":"argListString"
    }
];
hax.app.visiui.FunctionComponent.generator.addPropFunction = hax.app.visiui.FunctionComponent.addPropValues;
hax.app.visiui.FunctionComponent.generator.updatePropHandler = hax.app.visiui.FunctionComponent.propUpdateHandler;
 ;
/** This component represents a folderFunction, which is a function that is programmed using
 *hax tables rather than writing code. */
hax.app.visiui.FolderFunctionComponent = function(workspaceUI,folderFunction,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,folderFunction,hax.app.visiui.FolderFunctionComponent.generator,componentJson);
    hax.visiui.ParentContainer.init.call(this,this.getContentElement(),this.getWindow());
	hax.visiui.ParentHighlighter.init.call(this,this.getContentElement());
    
    //register this object as a parent container
    var internalFolder = folderFunction.getInternalFolder();
    workspaceUI.registerMember(internalFolder,null);
    workspaceUI.addComponentContainer(internalFolder,this);
    
    this.memberUpdated();
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.FolderFunctionComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.FolderFunctionComponent,hax.visiui.ParentContainer);
hax.core.util.mixin(hax.app.visiui.FolderFunctionComponent,hax.visiui.ParentHighlighter);

//----------------------
// ParentContainer Methods
//----------------------

/** This method must be implemented in inheriting objects. */
hax.app.visiui.FolderFunctionComponent.prototype.getContentIsShowing = function() {
    return this.getWindow().getContentIsShowing();
}

//==============================
// Protected and Private Instance Methods
//==============================

/** This serializes the folderFunction component. */
hax.app.visiui.FolderFunctionComponent.prototype.writeToJson = function(json) {
    var folderFunction = this.getObject();
    var internalFolder = folderFunction.getInternalFolder();
    var workspaceUI = this.getWorkspaceUI();
    json.children = workspaceUI.getFolderComponentContentJson(internalFolder);
}

/** This method populates the frame for this component. 
 * @protected */
hax.app.visiui.FolderFunctionComponent.prototype.populateFrame = function() {	
	this.setScrollingContentElement();
    
    //add context menu to create childrent
    var contentElement = this.getContentElement();
    var folderFunction = this.getObject();
    var internalFolder = folderFunction.getInternalFolder();
    var app = this.getWorkspaceUI().getApp();
    app.setFolderContextMenu(contentElement,internalFolder);
}

//======================================
// Static methods
//======================================

/** This method creates the component. */
hax.app.visiui.FolderFunctionComponent.createComponent = function(workspaceUI,data,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!

    var json = {};
    json.name = data.name; 
    if(data.argListString) {
        var argList = hax.app.visiui.FunctionComponent.parseStringArray(data.argListString);
        json.argList = argList;
    }
    if(data.returnValueString) {
        json.returnValue = data.returnValueString;
    }
    json.type = hax.core.FolderFunction.generator.type;
    
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var folderFunction = actionResponse.member;
    if(actionResponse.getSuccess()) {
        var folderFunctionComponent = new hax.app.visiui.FolderFunctionComponent(workspaceUI,folderFunction,componentOptions);
        actionResponse.component = folderFunctionComponent;
    }
    return actionResponse;
}

hax.app.visiui.FolderFunctionComponent.createComponentFromJson = function(workspaceUI,member,componentJson) {
    var folderFunctionComponent = new hax.app.visiui.FolderFunctionComponent(workspaceUI,member,componentJson);
    if((componentJson)&&(componentJson.children)) {
        var folder = member.getInternalFolder();
        workspaceUI.loadFolderComponentContentFromJson(folder,componentJson.children);
    }
    return folderFunctionComponent;
}


/** This method extends the base method to get the property values
 * for the property edit dialog. */
hax.app.visiui.FolderFunctionComponent.addPropValues = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    values.returnValueString = member.getReturnValueString();
    return values;
}

hax.app.visiui.FolderFunctionComponent.propUpdateHandler = function(member,oldValues,newValues,recalculateList) {
    if((oldValues.argListString !== newValues.argListString)||(oldValues.returnValueString !== newValues.returnValueString)) {
        var newArgList = hax.app.visiui.FunctionComponent.parseStringArray(newValues.argListString);
        hax.core.updatefolderFunction.updatePropertyValues(member,newArgList,newValues.returnValueString,recalculateList);
    }    
}

//======================================
// This is the component generator, to register the component
//======================================

hax.app.visiui.FolderFunctionComponent.generator = {};
hax.app.visiui.FolderFunctionComponent.generator.displayName = "Folder Function";
hax.app.visiui.FolderFunctionComponent.generator.uniqueName = "hax.app.visiui.FolderFunctionComponent";
hax.app.visiui.FolderFunctionComponent.generator.createComponent = hax.app.visiui.FolderFunctionComponent.createComponent;
hax.app.visiui.FolderFunctionComponent.generator.createComponentFromJson = hax.app.visiui.FolderFunctionComponent.createComponentFromJson;
hax.app.visiui.FolderFunctionComponent.generator.DEFAULT_WIDTH = 500;
hax.app.visiui.FolderFunctionComponent.generator.DEFAULT_HEIGHT = 500;

hax.app.visiui.FolderFunctionComponent.generator.propertyDialogLines = [
    {
        "type":"inputElement",
        "heading":"Arg List: ",
        "resultKey":"argListString"
    },
    {
        "type":"inputElement",
        "heading":"Return Val: ",
        "resultKey":"returnValueString"
    }
];
hax.app.visiui.FolderFunctionComponent.generator.addPropFunction = hax.app.visiui.FolderFunctionComponent.addPropValues;
hax.app.visiui.FolderFunctionComponent.generator.updatePropHandler = hax.app.visiui.FolderFunctionComponent.propUpdateHandler;
;
/** This is a custom resource component. 
 * To implement it, the resource script must have the methods "run()" which will
 * be called when the component is updated. It also must have any methods that are
 * confugred with initialization data from the model. */
hax.app.visiui.BasicControlComponent = function(workspaceUI,control,generator,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,control,generator,componentJson);
	hax.app.visiui.TableEditComponent.init.call(this,
		hax.app.visiui.BasicControlComponent.VIEW_MODES,
		hax.app.visiui.BasicControlComponent.DEFAULT_VIEW
	);
	
	var resource = control.getResource();
	resource.setComponent(this);
    //redo calculate in contrl now the UI is set up
    control.calculate();
    
    //add a cleanup action to call resource when delete is happening
    var cleanupAction = function() {
        if(resource.delete) {
            resource.delete();
        }
    }
    this.addCleanupAction(cleanupAction);
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.BasicControlComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.BasicControlComponent,hax.app.visiui.TableEditComponent);

//==============================
// Protected and Private Instance Methods
//==============================

hax.app.visiui.BasicControlComponent.prototype.getOutputElement = function() {
	return this.outputMode.getElement();
}

hax.app.visiui.BasicControlComponent.VIEW_OUTPUT = "Output";
hax.app.visiui.BasicControlComponent.VIEW_CODE = "Code";
hax.app.visiui.BasicControlComponent.VIEW_SUPPLEMENTAL_CODE = "Private";

hax.app.visiui.BasicControlComponent.VIEW_MODES = [
	hax.app.visiui.BasicControlComponent.VIEW_OUTPUT,
	hax.app.visiui.BasicControlComponent.VIEW_CODE,
    hax.app.visiui.BasicControlComponent.VIEW_SUPPLEMENTAL_CODE
];

hax.app.visiui.BasicControlComponent.DEFAULT_VIEW = hax.app.visiui.BasicControlComponent.VIEW_OUTPUT;

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
hax.app.visiui.BasicControlComponent.prototype.getViewModeElement = function(viewType) {
	
	//create the new view element;
	switch(viewType) {
		
		case hax.app.visiui.BasicControlComponent.VIEW_OUTPUT:
			if(!this.outputMode) {
				this.outputMode = new hax.app.visiui.ResourceOutputMode(this);
			}
			return this.outputMode;
			
		case hax.app.visiui.BasicControlComponent.VIEW_CODE:
			return new hax.app.visiui.AceCodeMode(this,false);
			
		case hax.app.visiui.BasicControlComponent.VIEW_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceSupplementalMode(this);
			
		default:
//temporary error handling...
			alert("unrecognized view element!");
			return null;
	}
}

//======================================
// Static methods
//======================================

hax.app.visiui.BasicControlComponent.createBaseComponent = function(workspaceUI,data,resource,generator,componentOptions) {
    
    var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
    var json = {};
    json.name = data.name;
    json.type = hax.core.Control.generator.type;
    var actionResponse = hax.core.createmember.createMember(parent,json);
    
    var control = actionResponse.member;
    if(control) {
		//set the resource
		control.updateResource(resource);
		
        //create the component
        var basicControlComponent = new hax.app.visiui.BasicControlComponent(workspaceUI,control,generator,componentOptions);
        actionResponse.component = basicControlComponent;
    }
    return actionResponse;
}


hax.app.visiui.BasicControlComponent.createBaseComponentFromJson = function(workspaceUI,member,generator,componentJson) {
    var customControlComponent = new hax.app.visiui.BasicControlComponent(workspaceUI,member,generator,componentJson);
    return customControlComponent;
}

;
/** This is a custom resource component. 
 * To implement it, the resource script must have the methods "run()" which will
 * be called when the component is updated. It also must have any methods that are
 * confugred with initialization data from the model. */
hax.app.visiui.CustomControlComponent = function(workspaceUI,control,componentJson) {
    //base init
    hax.app.visiui.Component.init.call(this,workspaceUI,control,hax.app.visiui.CustomControlComponent.generator,componentJson);
	hax.app.visiui.TableEditComponent.init.call(this,
		hax.app.visiui.CustomControlComponent.VIEW_MODES,
		hax.app.visiui.CustomControlComponent.DEFAULT_VIEW
	);
	
	//create a resource based on the json (or lack of a json)
    if((componentJson)&&(componentJson.resource)) {
        this.loadResourceFromJson(componentJson.resource);
    }
    else {
        this.loadEmptyResource();
    }
    
    //add a cleanup action to call resource when delete is happening
    var cleanupAction = function() {
        if(resource.delete) {
            resource.delete();
        }
    }
    this.addCleanupAction(cleanupAction);
};

//add components to this class
hax.core.util.mixin(hax.app.visiui.CustomControlComponent,hax.app.visiui.Component);
hax.core.util.mixin(hax.app.visiui.CustomControlComponent,hax.app.visiui.TableEditComponent);

//==============================
//Resource Accessors
//==============================

hax.app.visiui.CustomControlComponent.prototype.getHtml = function() {
    return this.html;
}

hax.app.visiui.CustomControlComponent.prototype.getCustomizeScript = function() {
    return this.customizeScript;
}

hax.app.visiui.CustomControlComponent.prototype.getSupplementalCode = function() {
    return this.supplementalCode;
}

hax.app.visiui.CustomControlComponent.prototype.getCss = function(msg) {
    return this.css;
}

//==============================
// Protected and Private Instance Methods
//==============================

hax.app.visiui.CustomControlComponent.prototype.getOutputElement = function() {
	return this.outputMode.getElement();
}

hax.app.visiui.CustomControlComponent.VIEW_OUTPUT = "Output";
hax.app.visiui.CustomControlComponent.VIEW_CODE = "Model Code";
hax.app.visiui.CustomControlComponent.VIEW_SUPPLEMENTAL_CODE = "Private";
hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_CODE = "Base Code";
hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_SUPPLEMENTAL_CODE = "Base Private";

hax.app.visiui.CustomControlComponent.VIEW_MODES = [
	hax.app.visiui.CustomControlComponent.VIEW_OUTPUT,
	hax.app.visiui.CustomControlComponent.VIEW_CODE,
    hax.app.visiui.CustomControlComponent.VIEW_SUPPLEMENTAL_CODE,
    hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_CODE,
    hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_SUPPLEMENTAL_CODE
];

hax.app.visiui.CustomControlComponent.DEFAULT_VIEW = hax.app.visiui.CustomControlComponent.VIEW_OUTPUT;

/** This method should be implemented to retrieve a view mode of the give type. 
 * @protected. */
hax.app.visiui.CustomControlComponent.prototype.getViewModeElement = function(viewType) {
	
	//create the new view element;
	switch(viewType) {
		
		case hax.app.visiui.CustomControlComponent.VIEW_OUTPUT:
			if(!this.outputMode) {
				this.outputMode = new hax.app.visiui.ResourceOutputMode(this);
			}
			return this.outputMode;
			
		case hax.app.visiui.CustomControlComponent.VIEW_CODE:
			return new hax.app.visiui.AceCodeMode(this,false);
			
		case hax.app.visiui.CustomControlComponent.VIEW_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceSupplementalMode(this);
			
		case hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_CODE:
			return new hax.app.visiui.AceCustomCodeMode(this);
			
		case hax.app.visiui.CustomControlComponent.VIEW_CUSTOM_SUPPLEMENTAL_CODE:
			return new hax.app.visiui.AceCustomSupplementalMode(this);
			
		default:
//temporary error handling...
			alert("unrecognized view element!");
			return null;
	}
}

/** This serializes the table component. */
hax.app.visiui.CustomControlComponent.prototype.writeToJson = function(json) {
    //store the resource info
    var control = this.getObject();
	var resource = control.getResource();
    if(resource) {
        json.resource = {};
        json.resource.html = this.html;
        json.resource.customizeScript = this.customizeScript;
        json.resource.supplementalCode = this.supplementalCode;
        json.resource.css = this.css;
    }
}

/** This method deseriliazes data for the custom resource component. */
hax.app.visiui.CustomControlComponent.prototype.updateFromJson = function(json) {  
    //load resource
    if(json.resource) {
        this.loadResourceFromJson(json.resource);
    }
    else {
        this.loadEmptyResource();
    }
}

hax.app.visiui.CustomControlComponent.prototype.loadEmptyResource = function() {
	this.update("","return {};","","");
}

/** This method deseriliazes data for the custom resource component. */
hax.app.visiui.CustomControlComponent.prototype.loadResourceFromJson = function(json) {   
	if(!json) json = {};
	var html = (json.html !== undefined) ? json.html : "";
	var customizeScript = (json.customizeScript !== undefined) ? json.customizeScript : "";
	var supplementalCode = (json.supplementalCode !== undefined) ? json.supplementalCode : "";
	var css = (json.css === undefined) ? json.css : "";
	
    this.update(html,customizeScript,supplementalCode,css);    
}

//=============================
// Action
//=============================

hax.app.visiui.CustomControlComponent.prototype.update = function(html,customizeScript,supplementalCode,css) {
    this.html = html;
	this.customizeScript = customizeScript;
	this.supplementalCode = supplementalCode;
	this.css = css;
    
	var actionResponse = new hax.core.ActionResponse();
    var control = this.getObject();
    control.clearErrors();
    
    try { 
        //create a new resource
        var resource = this.createResource();
        if(!resource) {
            throw new Error("resource.setComponent(component) is not defined");
        }

        //update the resource
        control.updateResource(resource);
        
        if(resource.setComponent) {
            resource.setComponent(this);
        }
        
        control.calculate();
        this.memberUpdated();
    }
    catch(error) {
        //user application error
        if(error.stack) {
            console.error(error.stack);
        }
        var errorMsg = error.message ? error.message : hax.core.ActionError.UNKNOWN_ERROR_MESSAGE;
        var actionError = new hax.core.ActionError(errorMsg,"Custom Control - Update",control);
        actionError.setParentException(error);
        
        control.addError(actionError);
        actionResponse.addError(actionError);
    }
    
    return actionResponse; 
}


//======================================
// Resource methods
//======================================

/** This method creates the member update javascript, which will be added to the
 * html page so the user easily can run it in the debugger if needed. 
 * @private */
hax.app.visiui.CustomControlComponent.prototype.createResource = function() {
    
    //create the resource generator wrapped with its closure
    var generatorFunctionBody = hax.core.util.formatString(
        hax.app.visiui.CustomControlComponent.GENERATOR_FUNCTION_FORMAT_TEXT,
		this.customizeScript,
        this.supplementalCode
    );
	
	//create the function generator, with the aliased variables in the closure
	var generatorFunction = new Function(generatorFunctionBody);
	var updateFunction = generatorFunction();
	
    var resource = updateFunction(this);
    return resource;
}



/** This is the format string to create the code body for updateing the member
 * Input indices:
 * 0: customize script
 * 1: supplemental code text
 * @private
 */
hax.app.visiui.CustomControlComponent.GENERATOR_FUNCTION_FORMAT_TEXT = [
"",
"//supplemental code",
"{1}",
"//end supplemental code",
"",
"//member function",
"var generator = function(component) {",
"{0}",
"}",
"//end member function",
"return generator;",
""
   ].join("\n");





//======================================
// Static methods
//======================================


/** This method creates the control. */
hax.app.visiui.CustomControlComponent.createComponent = function(workspaceUI,data,componentOptions) {
	var parent = workspaceUI.getObjectByKey(data.parentKey);
    //should throw an exception if parent is invalid!
    
	//create a generic component of this given name
    var json = {};
    json.name = data.name;
    json.type = hax.core.Control.generator.type;
    var actionResponse = hax.core.createmember.createMember(parent,json);
    var control = actionResponse.member;
	
    if(control) {
        //create the component
        var customControlComponent = new hax.app.visiui.CustomControlComponent.createComponentFromJson(workspaceUI,control,componentOptions);
        actionResponse.component = customControlComponent;
    }
    return actionResponse;
}

hax.app.visiui.CustomControlComponent.createComponentFromJson = function(workspaceUI,control,componentJson) {
    var customControlComponent = new hax.app.visiui.CustomControlComponent(workspaceUI,control,componentJson);
    return customControlComponent;
}


//======================================
// This is the control generator, to register the control
//======================================

hax.app.visiui.CustomControlComponent.generator = {};
hax.app.visiui.CustomControlComponent.generator.displayName = "Custom Control";
hax.app.visiui.CustomControlComponent.generator.uniqueName = "hax.app.visiui.CustomControlComponent";
hax.app.visiui.CustomControlComponent.generator.createComponent = hax.app.visiui.CustomControlComponent.createComponent;
hax.app.visiui.CustomControlComponent.generator.createComponentFromJson = hax.app.visiui.CustomControlComponent.createComponentFromJson;
hax.app.visiui.CustomControlComponent.generator.DEFAULT_WIDTH = 500;
hax.app.visiui.CustomControlComponent.generator.DEFAULT_HEIGHT = 500;

;
hax.app.visiui.CustomResource = function() {
	this.contentElement = null;
	
	this.html = "";
	this.customizeScript = "";
	this.supplementalCode = "";
	this.css = "";
}

hax.app.visiui.CustomResource.prototype.setComponent = function(component) {
    this.component = component;
}

hax.app.visiui.CustomResource.prototype.getContentElement = function() {
    return this.component.getOutputElement();
}

hax.app.visiui.CustomResource.prototype.getComponent = function() {
    return this.component;
}

hax.app.visiui.CustomResource.prototype.getHtml = function() {
    return this.html;
}

hax.app.visiui.CustomResource.prototype.getCustomizeScript = function() {
    return this.customizeScript;
}

hax.app.visiui.CustomResource.prototype.getSupplementalCode = function() {
    return this.supplementalCode;
}

hax.app.visiui.CustomResource.prototype.getCss = function(msg) {
    return this.css;
}

hax.app.visiui.CustomResource.prototype.update = function(html,customizeScript,supplementalCode,css) {
    this.html = html;
	this.customizeScript = customizeScript;
	this.supplementalCode = supplementalCode;
	this.css = css;
	
	//update the resource with the given data
	this.updateResource();
}

//======================================
// Resource methods
//======================================

/** This method creates the member update javascript, which will be added to the
 * html page so the user easily can run it in the debugger if needed. 
 * @private */
hax.app.visiui.CustomResource.prototype.updateResource = function() {
    
    //create the resource generator wrapped with its closure
    var generatorFunctionBody = hax.core.util.formatString(
        hax.app.visiui.CustomResource.GENERATOR_FUNCTION_FORMAT_TEXT,
		this.customizeScript,
        this.supplementalCode
    );
	
	//create the function generator, with the aliased variables in the closure
	var generatorFunction = new Function(generatorFunctionBody);
	var updateFunction = generatorFunction();
	
    var resource = updateFunction(this);
    var control = this.getObject();
    control.updateResource(resource);
}



/** This is the format string to create the code body for updateing the member
 * Input indices:
 * 0: customize script
 * 1: supplemental code text
 * @private
 */
hax.app.visiui.CustomResource.GENERATOR_FUNCTION_FORMAT_TEXT = [
"",
"//supplemental code",
"{1}",
"//end supplemental code",
"",
"//member function",
"var generator = function(component) {",
"{0}",
"}",
"//end member function",
"return generator;",
""
   ].join("\n");


;

hax.app.visiui.openworkspace = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.openworkspace.getOpenCallback = function(app) {
    return function() {
    
        var onOpen = function(workspaceData) {
                
            var actionCompletedCallback = function(actionResponse) {
                if(!actionResponse.getSuccess()) {
                    alert(actionResponse.getErrorMsg());
                }
            };
            
            //open workspace
            hax.app.visiui.openworkspace.openWorkspace(app,workspaceData,actionCompletedCallback);

            //we should show some sort of loading message or symbol
            return true;
        }
        
        hax.app.visiui.dialog.showOpenWorkspaceDialog(onOpen);
    }
}

//=====================================
// Action
//=====================================


/** This method opens an workspace, from the text file. 
 * The result is returnd through the callback function rather than a return value,
 * since the function runs (or may run) asynchronously. */
hax.app.visiui.openworkspace.openWorkspace = function(app,workspaceText,actionCompletedCallback) {
    var actionResponse = new hax.core.ActionResponse();
    var name;
    var workspaceUIAdded;
    
    try {
        //parse the workspace json
        var workspaceJson = JSON.parse(workspaceText);

//I should verify the file type and format!    

		//make a blank workspace
        name = workspaceJson.workspace.name;
        
        var workspaceUI = new hax.app.visiui.WorkspaceUI();
        workspaceUIAdded = app.addWorkspaceUI(workspaceUI,name);
    
        //add links, if applicable
		var jsLinks;
		var cssLinks;
        var linksAdded = false;
        if((workspaceJson.jsLinks)&&(workspaceJson.jsLinks.length > 0)) {
            jsLinks = workspaceJson.jsLinks;
            linksAdded = true;
        }
		else {
			jsLinks = [];
		}
        if((workspaceJson.cssLinks)&&(workspaceJson.cssLinks.length > 0)) {
			cssLinks = workspaceJson.cssLinks;
            linksAdded = true;
        }
		else {
			cssLinks = [];
		}
    	
		//if we have to load links wait for them to load
		var doWorkspaceLoad = function() {
            hax.app.visiui.openworkspace.loadWorkspace(workspaceUI,workspaceJson);
            actionCompletedCallback(actionResponse);
        }
        
        if(linksAdded) {
			//set links and set the callback to complete loading the workspace
			workspaceUI.setLinks(jsLinks,cssLinks,doWorkspaceLoad,name);
		}
		else {
			//immediately load the workspace - no links to wait for
            doWorkspaceLoad();
		}
    }
    catch(error) {
        if(workspaceUIAdded) {
            app.removeWorkspaceUI(name);
        }
        var actionError = hax.core.ActionError.processException(error,"AppException",false);
        actionResponse.addError(actionError);
        actionCompletedCallback(actionResponse);
    }
}

/** This method loads an existing workspace into an empty workspace UI. */
hax.app.visiui.openworkspace.loadWorkspace = function(workspaceUI,workspaceJson,actionResponse) {
    var workspaceDataJson = workspaceJson.workspace;
    var workspaceComponentsJson = workspaceJson.components;

    var workspace = new hax.core.Workspace(workspaceDataJson,actionResponse);
    
    workspaceUI.setWorkspace(workspace,workspaceComponentsJson);
}


//------------------------
// open from url
//------------------------

/** This method opens an workspace by getting the workspace file from the url. */
hax.app.visiui.openworkspace.openWorkspaceFromUrl = function(app,url) {
    var actionCompletedCallback = function(actionResponse) {
        if(!actionResponse.getSuccess()) {
            alert(actionResponse.getErrorMsg());
        }
    };
    
    hax.app.visiui.openworkspace.openWorkspaceFromUrlImpl(app,url,actionCompletedCallback);
}

/** This method opens an workspace by getting the workspace file from the url. */
hax.app.visiui.openworkspace.openWorkspaceFromUrlImpl = function(app,url,actionCompletedCallback) {
    var onDownload = function(workspaceText) {
        hax.app.visiui.openworkspace.openWorkspace(app,workspaceText,actionCompletedCallback);
    }
    
    var onFailure = function(msg) {
        var actionError = new hax.core.ActionError(msg,"AppException",null);
        var actionResponse = new hax.core.ActionResponse();
        actionResponse.addError(actionError);
        actionCompletedCallback(actionResponse);
    }   
    hax.app.visiui.openworkspace.doRequest(url,onDownload,onFailure);   
}

/**
 * This is an http request for the worksheet data
 */
hax.app.visiui.openworkspace.doRequest= function(url,onDownload,onFailure) {
	var xmlhttp=new XMLHttpRequest();

    xmlhttp.onreadystatechange=function() {
        var msg;
        if (xmlhttp.readyState==4 && xmlhttp.status==200) {
            onDownload(xmlhttp.responseText);
        }
        else if(xmlhttp.readyState==4  && xmlhttp.status >= 400)  {
            msg = "Error in http request. Status: " + xmlhttp.status;
            onFailure(msg);
        }
    }
	
	xmlhttp.open("GET",url,true);
    xmlhttp.send();
};

hax.app.visiui.createworkspace = {};

//=====================================
// UI Entry Point
//=====================================


hax.app.visiui.createworkspace.getCreateCallback = function(app) {
    return function() {
        
        var onCreate = function(name) {
            var actionResponse = hax.app.visiui.createworkspace.createWorkspace(app,name);
            if(!actionResponse.getSuccess()) {
                alert(actionResponse.getErrorMsg());
            }
            return true;
        }
        
        hax.app.visiui.dialog.showCreateWorkspaceDialog(onCreate); 
    }
}

//=====================================
// Action
//=====================================

/** This method creates a new workspace. */
hax.app.visiui.createworkspace.createWorkspace = function(app,name) {
    var actionResponse = new hax.core.ActionResponse();
    var workspaceUIAdded;
    
    try {
        //make the workspace ui
        var workspaceUI = new hax.app.visiui.WorkspaceUI();
        workspaceUIAdded = app.addWorkspaceUI(workspaceUI,name);
        
        //create and edd an empty workspace
        var workspace = new hax.core.Workspace(name);
        workspaceUI.setWorkspace(workspace);
    
        actionResponse.workspaceUI = workspaceUI;
    }
    catch(error) { 
        if(workspaceUIAdded) {
            app.removeWorkspaceUI(name);
        }
        
        var actionError = hax.core.ActionError.processException(error,"AppException",false);
        actionResponse.addError(actionError);
    }
    
    return actionResponse; 
}
;


hax.app.visiui.closeworkspace = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.closeworkspace.getCloseCallback = function(app) {
    return function() {

        var actionResponse = hax.app.visiui.closeworkspace.closeWorkspace(app); 
        if(!actionResponse.getSuccess()) {
            alert(actionResponse.getErrorMsg());
        }
    }
}

//=====================================
// Action
//=====================================

hax.app.visiui.closeworkspace.closeWorkspace = function(app) {
    var actionResponse = new hax.core.ActionResponse();
    var workspaceUIRemoved = false;
    
    try {
    
        var activeWorkspaceUI = app.getActiveWorkspaceUI();
        if(activeWorkspaceUI === null) {
            var errorMsg = "There is no workspace open.";
            var actionError = new hax.core.ActionError(errorMsg,"User",null);
            actionResponse.addError(actionError);
            return actionResponse;
        }

        var workspace = activeWorkspaceUI.getWorkspace();
        
        var name = workspace.getName();
        
        var doRemove = confirm("Are you sure you want to close the workspace " + name + "?");
        if(!doRemove) {
            return actionResponse;
        }
        
        workspaceUIRemoved = app.removeWorkspaceUI(name);
        
        activeWorkspaceUI.close();
        workspace.close();
    }
    catch(error) {
        var isFatal = !workspaceUIRemoved;
        var actionError = hax.core.ActionError.processException(error,"AppException",isFatal);
        actionResponse.addError(actionError);
    }
    
    return actionResponse;
}




;


hax.app.visiui.saveworkspace = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.saveworkspace.getSaveCallback = function(app) {
    return function() {
        
        var activeWorkspaceUI = app.getActiveWorkspaceUI();
        if(activeWorkspaceUI === null) {
            alert("There is no workspace open.");
            return
        }
        
        hax.app.visiui.dialog.showSaveWorkspaceDialog(app, activeWorkspaceUI);
    }
}

//=====================================
// Action
//=====================================

//for now there is no action
;


hax.app.visiui.updatecomponent = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.updatecomponent.getAddComponentCallback = function(app,generator,optionalInitialValues,optionalComponentOptions) {
    
    var createCallback = function() {
        //get the active workspace
        var workspaceUI = app.getActiveWorkspaceUI();
        if(!workspaceUI) {
            alert("There is no open workspace.");
            return;
        }     
        
        //create the dialog layout - do on the fly because folder list changes
        var dialogLayout = hax.app.visiui.updatecomponent.getDialogLayout(workspaceUI,generator,true,optionalInitialValues);
        
        //create on submit callback
        var onSubmitFunction = function(result) {
            
            //need to test if fields are valid!

            var actionResponse =  generator.createComponent(workspaceUI,result,optionalComponentOptions);   
            if(!actionResponse.getSuccess()) {
                alert(actionResponse.getErrorMsg())
            }
            //return true to close the dialog
            return true;
        }
        
        //show dialog
        hax.app.visiui.dialog.showConfigurableDialog(dialogLayout,onSubmitFunction);
    }
    
    return createCallback;
    
}

hax.app.visiui.updatecomponent.getUpdateComponentCallback = function(component,generator) {
    
    var createCallback = function() {
        
        var workspaceUI = component.getWorkspaceUI();       
        var initialValues = component.getPropertyValues();
        
        //create the dialog layout - do on the fly because folder list changes
        var dialogLayout = hax.app.visiui.updatecomponent.getDialogLayout(workspaceUI,generator,false,initialValues);
        
        //create on submit callback
        var onSubmitFunction = function(newValues) {
            
            //see if there were no changes
            var change = false;
            for(var key in newValues) {
                if(newValues[key] !== initialValues[key]) change = true;
            }
            if(!change) {
                return true;
            }
            
            //need to test if fields are valid!

            //update
            var actionResponse = component.updatePropertyValues(initialValues,newValues);
              
            //print an error message if there was an error
            if(!actionResponse.getSuccess()) {
                alert(actionResponse.getErrorMsg())
            }

            //return true to close the dialog
            return true;
        }
        
        //show dialog
        hax.app.visiui.dialog.showConfigurableDialog(dialogLayout,onSubmitFunction);
    }
    
    return createCallback;
    
}

//this is for a create or update dialog
hax.app.visiui.updatecomponent.getDialogLayout = function(workspaceUI,generator,doCreate,initialValues) {
    
    var additionalLines = hax.core.util.deepJsonCopy(generator.propertyDialogLines);  
    
    //create the dialog layout - do on the fly because folder list changes
    var dialogLayout = {};
    var lines = [];
    dialogLayout.lines = lines;

    var titleLine = {};
    titleLine.type = "title";
    if(doCreate) {
        titleLine.title = "New " + generator.displayName;
    }
    else {
        titleLine.title = "Update " + generator.displayName; 
    }
    lines.push(titleLine);

    var parentLine = {};
    parentLine.type = "dropdown";
    parentLine.heading = "Folder: ";
    parentLine.entries = workspaceUI.getFolderList();
    parentLine.resultKey = "parentKey"; 
    lines.push(parentLine);

    var nameLine = {};
    nameLine.type = "inputElement";
    nameLine.heading = "Name: ";
    nameLine.resultKey = "name";
    lines.push(nameLine);
    
    //add additioanl lines, if applicable
    if(additionalLines) {
        for(var i = 0; i < additionalLines.length; i++) {
            lines.push(additionalLines[i]);
        }
    }

    //submit
    var submitLine = {};
    submitLine.type = "submit";
    if(doCreate) {
        submitLine.submit = "Create";
    }
    else {
        submitLine.submit = "Update";
    }
    submitLine.cancel = "Cancel";
    lines.push(submitLine);
    
    //set the initial values
    if(initialValues) {
        for(var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if(line.resultKey) {
                line.initial = initialValues[line.resultKey];
            }
        }
    }
    
    return dialogLayout;
}

//=====================================
// Action
//=====================================

//action is in the component generator






;


hax.app.visiui.addadditionalcomponent = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.addadditionalcomponent.getAddAdditionalComponentCallback = function(app,optionalInitialValues,optionalComponentOptions) {
    return function() {
    
        var onSelect = function(componentType) {
            var generator = app.getComponentGenerator(componentType);
            if(generator) {
                var doAddComponent = hax.app.visiui.updatecomponent.getAddComponentCallback(app,generator,optionalInitialValues,optionalComponentOptions);
                doAddComponent();
            }
            else {
                alert("Unknown component type: " + componentType);
            }
        }
        //open select component dialog
        hax.app.visiui.dialog.showSelectComponentDialog(app.additionalComponents,onSelect);
    }
}

//=====================================
// Action
//=====================================


;


hax.app.visiui.updatelinks = {};

//=====================================
// UI Entry Point
//=====================================

hax.app.visiui.updatelinks.getUpdateLinksCallback = function(app) {
    return function() {
        
        var activeWorkspaceUI = app.getActiveWorkspaceUI();
        if(!activeWorkspaceUI) {
            alert("There is no open workspace.");
            return;
        }
        hax.app.visiui.dialog.showUpdateLinksDialog(activeWorkspaceUI);
    }
}

//=====================================
// Action
//=====================================
;
/** Editor that uses the Ace text editor.
 * 
 * @param {type} component - the hax component
 * @param {type} aceMode - the display format, such as "ace/mode/json"
 * @param {type} onSave - takes a text json representation for saving. returns true if the edit should end.
 * @param {type} onCancel - returns true if the edit should end
 */
hax.app.visiui.TextAreaEditor = function(component,onSave,onCancel) {
    
    this.outsideDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"hidden"
	});
   
	var textArea = hax.visiui.createElement("TEXTAREA",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
        "width":"100%",
        "height":"100%",
		"overflow":"auto"
	});
    this.textArea = textArea;
    this.textArea.readOnly = true;
    this.outsideDiv.appendChild(this.textArea);  
	
	this.component = component;
	this.table = component.getObject();
	this.workingData = null;
	this.editOk = false;
	this.editMode = false;
	
	this.parentSave = onSave;
	this.parentCancel = onCancel;
	
//	//resize the editor on window size change
//    var resizeCallback = function() {
//        editor.resize();
//    }
	
//    hax.visiui.setResizeListener(this.outsideDiv, resizeCallback);
	
	//add click handle to enter edit mode
	var instance = this;
	var onMouseClick = function() {
		instance.onMouseClick();
	}
	this.textArea.addEventListener("click",onMouseClick);
}

hax.app.visiui.TextAreaEditor.prototype.save = function() {
	
	var text = this.textArea.value;
	
	var saveComplete = this.parentSave(text);
	
	if(saveComplete) {
		this.endEditMode();
	}
}

hax.app.visiui.TextAreaEditor.prototype.cancel = function() {
	//reset the original data
	var cancelComplete = this.parentCancel();
	
	if(cancelComplete) {
		this.endEditMode();
	}
}

//=============================
// "Package" Methods
//=============================

hax.app.visiui.TextAreaEditor.prototype.getElement = function() {
	return this.outsideDiv;
}
	
hax.app.visiui.TextAreaEditor.prototype.showData = function(text,editOk) {
	this.editOk = editOk;
    this.textArea.readOnly = !editOk;
	this.textArea.value = text;
    
    //set the background color
    if(this.editOk) {
        this.textArea.style.backgroundColor = "";
    }
    else {
        this.textArea.style.backgroundColor = hax.app.visiui.TableEditComponent.NO_EDIT_BACKGROUND_COLOR;
    }
    
}

hax.app.visiui.TextAreaEditor.prototype.destroy = function() {
}

//==============================
// Private Methods
//==============================

/** @private */
hax.app.visiui.TextAreaEditor.prototype.endEditMode = function() {
	this.editMode = false;
	this.textArea.readOnly = true;
	this.component.endEditUI();
}

/** @private */
hax.app.visiui.TextAreaEditor.prototype.onMouseClick = function() {
	if((this.editOk)&&(!this.editMode)) {
		
		var instance = this;
		var onSave = function() {
			instance.save();
		}
		var onCancel = function() {
			instance.cancel();
		}
		
		this.component.startEditUI(onSave,onCancel);
		
		this.textArea.readOnly = false;
		this.editMode = true;
	}
}


;

hax.app.visiui.TextAreaMode = function(component) {
	this.component = component;
	
	this.editOk = false;
	
	var instance = this;
	var onSave = function(text) {
		return instance.onSave(text);
	}
	var onCancel = function() {
		return instance.onCancel();
	}
	
	this.editor = new hax.app.visiui.TextAreaEditor(component,onSave,onCancel);
	
}

/** This is the format character use to display tabs in the display editor. 
 * @private*/
hax.app.visiui.TextAreaMode.formatString = "\t";

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.TextAreaMode.prototype.isData = true;

hax.app.visiui.TextAreaMode.prototype.getElement = function() {
	return this.editor.getElement();
}
	
hax.app.visiui.TextAreaMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var json = table.getData();	

	this.editOk = editOk;
	
	var textData;
	if(json === null) {
		textData = "null";
	}
	else if(json === undefined) {
		textData = "undefined";
	}
	else {
		textData = JSON.stringify(json,null,hax.app.visiui.TextAreaMode.formatString);
	}
	
	this.editor.showData(textData,editOk);
}

hax.app.visiui.TextAreaMode.prototype.destroy = function() {
	this.editor.destroy();
}

//==============================
// internal
//==============================

hax.app.visiui.TextAreaMode.prototype.onSave = function(text) {
	
	
	var data;
	if(text.length > 0) {
		try {
			data = JSON.parse(text);
		}
		catch(error) {
			//parsing error
			alert("There was an error parsing the JSON input: " +  error.message);
			return false;
		}
	}
	else {
		data = "";
	}
	
	var table = this.component.getObject();
	hax.core.updatemember.updateData(table,data);
//the response should depend on this result in some way? check the error dialogs
	
	return true;
}
hax.app.visiui.TextAreaMode.prototype.onCancel = function() {
	//reload old data
	this.showData(this.editOk);
	
	return true;
}
;
/** Editor that uses the Ace text editor.
 * 
 * @param {type} component - the hax component
 * @param {type} aceMode - the display format, such as "ace/mode/json"
 * @param {type} onSave - takes a text json representation for saving. returns true if the edit should end.
 * @param {type} onCancel - returns true if the edit should end
 */
hax.app.visiui.AceTextEditor = function(component,aceMode,onSave,onCancel) {
    
    this.outsideDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"hidden"
	});
   
	this.editorDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"auto"
	});
    this.outsideDiv.appendChild(this.editorDiv);
	
	this.component = component;
	this.table = component.getObject();
	this.workingData = null;
	this.editOk = false;
	this.editMode = false;
	
	this.parentSave = onSave;
	this.parentCancel = onCancel;
	
	var editor = ace.edit(this.editorDiv);
    editor.renderer.setShowGutter(true);
    editor.setReadOnly(true);
    editor.setTheme("ace/theme/eclipse"); //good
    editor.getSession().setMode(aceMode); 
	editor.$blockScrolling = Infinity;
    this.editor = editor;
	
	//resize the editor on window size change
    var resizeCallback = function() {
        editor.resize();
    }
	
    hax.visiui.setResizeListener(this.outsideDiv, resizeCallback);
	
	//add click handle to enter edit mode
	var instance = this;
	var onMouseClick = function() {
		instance.onMouseClick();
	}
	this.editorDiv.addEventListener("click",onMouseClick);
}

hax.app.visiui.AceTextEditor.prototype.save = function() {
	
	var text = this.editor.getSession().getValue();
	
	var saveComplete = this.parentSave(text);
	
	if(saveComplete) {
		this.endEditMode();
	}
}

hax.app.visiui.AceTextEditor.prototype.cancel = function() {
	//reset the original data
	var cancelComplete = this.parentCancel();
	
	if(cancelComplete) {
		this.endEditMode();
	}
}

//=============================
// "Package" Methods
//=============================

hax.app.visiui.AceTextEditor.prototype.getElement = function() {
	return this.outsideDiv;
}
	
hax.app.visiui.AceTextEditor.prototype.showData = function(text,editOk) {
	this.editOk = editOk;
	this.editor.getSession().setValue(text);
    
    //set the background color
    if(this.editOk) {
        this.editorDiv.style.backgroundColor = "";
    }
    else {
        this.editorDiv.style.backgroundColor = hax.app.visiui.TableEditComponent.NO_EDIT_BACKGROUND_COLOR;
    }
    
}

hax.app.visiui.AceTextEditor.prototype.destroy = function() {
	if(this.editor) {
        this.editor.destroy();
        this.editor = null;
    }
}

//==============================
// Private Methods
//==============================

/** @private */
hax.app.visiui.AceTextEditor.prototype.endEditMode = function() {
	this.editMode = false;
	this.editor.setReadOnly(true);
	this.component.endEditUI();
}

/** @private */
hax.app.visiui.AceTextEditor.prototype.onMouseClick = function() {
	if((this.editOk)&&(!this.editMode)) {
		
		var instance = this;
		var onSave = function() {
			instance.save();
		}
		var onCancel = function() {
			instance.cancel();
		}
		
		this.component.startEditUI(onSave,onCancel);
		
		this.editor.setReadOnly(false);
		this.editMode = true;
	}
}
;
/** This is a base class for different code editors (this is not a mixin). */
hax.app.visiui.AceCodeModeBase = function(component,mode) {
	this.component = component;
	
	this.editOk = false;
	
	var instance = this;
	var onSave = function(text) {
		return instance.onSave(text);
	}
	var onCancel = function() {
		return instance.onCancel();
	}
	
	this.editor = new hax.app.visiui.AceTextEditor(component,mode,onSave,onCancel);
	
}

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.AceCodeModeBase.prototype.isData = false;

hax.app.visiui.AceCodeModeBase.prototype.getElement = function() {
	return this.editor.getElement();
}

hax.app.visiui.AceCodeModeBase.prototype.getComponent = function() {
	return this.component;
}
	
//Implement this!
//hax.app.visiui.AceCodeModeBase.prototype.showData = function(editOk);

hax.app.visiui.AceCodeModeBase.prototype.destroy = function() {
	this.editor.destroy();
}

//==============================
// internal
//==============================

//Implemn
//hax.app.visiui.AceCodeModeBase.prototype.onSave = function(text);

hax.app.visiui.AceCodeModeBase.prototype.onCancel = function() {
	//reload old data
	this.showData(this.editOk);
	
	return true;
}
;
/** This is a code editor. It expects the body of the object function. Optionally
 * a code wrapper can be passed in to wrap and unwrap the code text before and
 * after editing. There is also an option to pass in an instruction for setting data
 * when the code is the empty string. This can be used to set the data value rather than the
 * code, such as on a data object. The data will be set asn optionalOnBlankData.value if the
 * code is set to the empty string. If no action is desired, false or any value that evaluates to
 * false can be sent in.
 */
hax.app.visiui.AceCodeMode = function(component,optionalOnBlankData,optionalEditorCodeWrapper) {
	//base constructor
	hax.app.visiui.AceCodeModeBase.call(this,component,"ace/mode/javascript");
	
	this.onBlankData = optionalOnBlankData;
	this.editorCodeWrapper = optionalEditorCodeWrapper;
}

hax.app.visiui.AceCodeMode.prototype = Object.create(hax.app.visiui.AceCodeModeBase.prototype);
hax.app.visiui.AceCodeMode.prototype.constructor = hax.app.visiui.AceCodeMode;
	
hax.app.visiui.AceCodeMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var functionBody = table.getFunctionBody();
	
	var codeText;
	if(this.editorCodeWrapper) {
		codeText = this.editorCodeWrapper.unwrapCode(functionBody);
	}
	else {
		codeText = functionBody;
	}
	
    this.editOk = editOk;
	this.editor.showData(codeText,editOk);
}

hax.app.visiui.AceCodeMode.prototype.onSave = function(text) {	
	
	var table = this.component.getObject();
	
	if((this.onBlankData)&&(text === "")) {
		//special case - clear code
		var data = this.onBlankData.dataValue; 
		hax.core.updatemember.updateData(table,data);
	}
	else {
		//standard case - edit code
	
		var functionBody;
		if(this.editorCodeWrapper) {
			functionBody = this.editorCodeWrapper.wrapCode(text);
		}
		else {
			functionBody = text;
		}

		var supplementalCode = table.getSupplementalCode();
		var argList = table.getArgList();
		var actionResponse =  hax.core.updatemember.updateCode(table,argList,functionBody,supplementalCode);
		if(!actionResponse.getSuccess()) {
			//show an error message
			var msg = actionResponse.getErrorMsg();
			alert(msg);
		}
	}
        
	return true;  
}
;

hax.app.visiui.AceDataMode = function(component,doJsonFormatting) {
	this.component = component;
	
	this.editOk = false;
	
	var instance = this;
	var onSave = function(text) {
		return instance.onSave(text);
	}
	var onCancel = function() {
		return instance.onCancel();
	}
	
    var mode = doJsonFormatting ? "ace/mode/json" : "ace/mode/text";
	this.editor = new hax.app.visiui.AceTextEditor(component,mode,onSave,onCancel);
	
}

/** This is the format character use to display tabs in the display editor. 
 * @private*/
hax.app.visiui.AceDataMode.formatString = "\t";

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.AceDataMode.prototype.isData = true;

hax.app.visiui.AceDataMode.prototype.getElement = function() {
	return this.editor.getElement();
}
	
hax.app.visiui.AceDataMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var json = table.getData();	

	this.editOk = editOk;
	
	var textData;
	if(json === null) {
		textData = "null";
	}
	else if(json === undefined) {
		textData = "undefined";
	}
	else {
		textData = JSON.stringify(json,null,hax.app.visiui.AceDataMode.formatString);
	}
	
	this.editor.showData(textData,editOk);
}

hax.app.visiui.AceDataMode.prototype.destroy = function() {
	this.editor.destroy();
}

//==============================
// internal
//==============================

hax.app.visiui.AceDataMode.prototype.onSave = function(text) {
	
	
	var data;
	if(text.length > 0) {
		try {
			data = JSON.parse(text);
		}
		catch(error) {
			//parsing error
			alert("There was an error parsing the JSON input: " +  error.message);
			return false;
		}
	}
	else {
		data = "";
	}
	
	var table = this.component.getObject();
	hax.core.updatemember.updateData(table,data);
//the response should depend on this result in some way? check the error dialogs
	
	return true;
}
hax.app.visiui.AceDataMode.prototype.onCancel = function() {
	//reload old data
	this.showData(this.editOk);
	
	return true;
}
;

hax.app.visiui.AceSupplementalMode = function(component) {
	//base constructor
	hax.app.visiui.AceCodeModeBase.call(this,component,"ace/mode/javascript");
}

hax.app.visiui.AceSupplementalMode.prototype = Object.create(hax.app.visiui.AceCodeModeBase.prototype);
hax.app.visiui.AceSupplementalMode.prototype.constructor = hax.app.visiui.AceSupplementalMode;

hax.app.visiui.AceSupplementalMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var codeText = table.getSupplementalCode();	
	
	this.editor.showData(codeText,editOk);
}

hax.app.visiui.AceSupplementalMode.prototype.onSave = function(text) {	
	var table = this.component.getObject();
	var functionBody = table.getFunctionBody();
	var supplementalCode = text;
	var argList = table.getArgList();
	var actionResponse =  hax.core.updatemember.updateCode(table,argList,functionBody,supplementalCode);
	if(!actionResponse.getSuccess()) {
		//show an error message
		var msg = actionResponse.getErrorMsg();
		alert(msg);
	}
        
	return true;  
}
;

hax.app.visiui.AceCustomCodeMode = function(component) {
	//base constructor
	hax.app.visiui.AceCodeModeBase.call(this,component,"ace/mode/javascript");
}

hax.app.visiui.AceCustomCodeMode.prototype = Object.create(hax.app.visiui.AceCodeModeBase.prototype);
hax.app.visiui.AceCustomCodeMode.prototype.constructor = hax.app.visiui.AceCustomCodeMode;
	
hax.app.visiui.AceCustomCodeMode.prototype.showData = function(editOk) {
		
	var codeText = this.component.getCustomizeScript();
	
    this.editOk = editOk;
	this.editor.showData(codeText,editOk);
}

hax.app.visiui.AceCustomCodeMode.prototype.onSave = function(text) {	
	
	//add these later
	var html = "";
	var css = "";
	
	var customizeScript = text;
	var supplementalCode = this.component.getSupplementalCode();
	
	var actionResponse = this.component.update(html,customizeScript,supplementalCode,css);
	if(!actionResponse.getSuccess()) {
		//show an error message
		var msg = actionResponse.getErrorMsg();
		alert(msg);
	}
        
	return true;  
}
;

hax.app.visiui.AceCustomSupplementalMode = function(component) {
	//base constructor
	hax.app.visiui.AceCodeModeBase.call(this,component,"ace/mode/javascript");
}

hax.app.visiui.AceCustomSupplementalMode.prototype = Object.create(hax.app.visiui.AceCodeModeBase.prototype);
hax.app.visiui.AceCustomSupplementalMode.prototype.constructor = hax.app.visiui.AceCustomSupplementalMode;

hax.app.visiui.AceCustomSupplementalMode.prototype.showData = function(editOk) {
	var codeText = this.component.getSupplementalCode();
	this.editor.showData(codeText,editOk);
}

hax.app.visiui.AceCustomSupplementalMode.prototype.onSave = function(text) {	
	
	//add these later
	var html = "";
	var css = "";
	
	var customizeScript = this.component.getCustomizeScript();
	var supplementalCode = text;
	
	var component = this.getComponent();
	var actionResponse = component.update(html,customizeScript,supplementalCode,css);
	if(!actionResponse.getSuccess()) {
		//show an error message
		var msg = actionResponse.getErrorMsg();
		alert(msg);
	}
        
	return true;  
}
;
/** Editor that uses json edit area
 * 
 * @param {type} onSave - should take a json object that should be saved.
 */
hax.app.visiui.JsonFormEditor = function(onSave) {
	
	this.editorDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"auto"
	});
    
    this.workingData = {"d":"c"}; //we need to set it to someting that ntohing can ===
	this.editOk = false;
	
	this.editor = null;

	var instance = this;
	this.editCallback = function() {
        var currentData = instance.editor.getCurrentValue();
        instance.workingData = currentData;
        onSave(currentData);
    }
}

hax.app.visiui.JsonFormEditor.prototype.getElement = function() {
	return this.editorDiv;
}

hax.app.visiui.JsonFormEditor.prototype.showData = function(data,editOk) {
    if((data === this.workingData)&&(this.editOk === editOk)) {
        //no need to update
        return;
    }
	
	//the value undefined will break things. It is not a valid json value.
	//I should verify I handle this consistently through app.
	if(data === undefined) data = null;
    
    this.workingData = hax.core.util.deepJsonCopy(data);
    this.editOk = editOk;
    
	hax.core.util.removeAllChildren(this.editorDiv);
	this.editor = new hax.jsonedit.JsonEditArea(this.editorDiv,data,editOk);
    
    this.editor.setEditCallback(this.editCallback);
    
    //set the background color
    if(this.editOk) {
        this.editorDiv.style.backgroundColor = "";
    }
    else {
        this.editorDiv.style.backgroundColor = hax.app.visiui.TableEditComponent.NO_EDIT_BACKGROUND_COLOR;
    }
}

;

hax.app.visiui.FormDataMode = function(component) {
	this.component = component;

	var instance = this;
	var onSave = function(data) {
		instance.onSave(data);
	}
	
	this.editor = new hax.app.visiui.JsonFormEditor(onSave);
	
}

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.FormDataMode.prototype.isData = true;

hax.app.visiui.FormDataMode.prototype.getElement = function() {
	return this.editor.getElement();
}
	
hax.app.visiui.FormDataMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var json = table.getData();	
	
	this.editor.showData(json,editOk);
}

hax.app.visiui.FormDataMode.prototype.destroy = function() {
}

//==============================
// internal
//==============================

hax.app.visiui.FormDataMode.prototype.onSave = function(data) {

	var table = this.component.getObject();
	hax.core.updatemember.updateData(table,data);
//the response should depend on this result in some way? check the error dialogs
	
	return true;
}

;
/** Editor that uses the Ace text editor.
 * 
 * @param {type} component - the hax component
 * @param {type} onSave - takes a text json representation for saving. returns true if the edit should end.
 * @param {type} onCancel - returns true if the edit should end
 */
hax.app.visiui.HandsonGridEditor = function(component,onSave,onCancel) {
   
	this.outsideDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"hidden"
	});
	
//TBR initial sizing. now I just set it to a dummy number	
	
	this.gridDiv = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
        "width":"50px",
        "height":"50px",
		"overflow":"hidden",
        "zIndex":0
	});
	this.outsideDiv.appendChild(this.gridDiv);
	
	this.component = component;
	this.table = component.getObject();
	this.inputData = null;
	this.editOk = false;
	
	this.parentSave = onSave;
	this.parentCancel = onCancel;
	
	//resize the editor on window size change
    var instance = this;
    var resizeCallback = function() {
        instance.gridDiv.style.width = instance.outsideDiv.clientWidth + "px";
        instance.gridDiv.style.height = instance.outsideDiv.clientHeight + "px";
        if(instance.gridControl) {
            instance.gridControl.render();
        }
    }
   hax.visiui.setResizeListener(this.outsideDiv, resizeCallback);
	
	//grid edited function
	this.gridEdited = function(args) {
		instance.save(arguments);
	}
    
    //on a paste, the event is fired for each row created. We delay it here to haev fewer updates of the rest of the sheet
    this.timerInProcess = false;
    var REFRESH_DELAY = 50;
    
    this.delayGridEdited = function(args) {
        //if there is no timer waiting, start a timer
        if(!instance.timerInProcess) {
            instance.timerInProcess = true;
            var callEditEvent = function(args) {
                instance.timerInProcess = false;
                instance.gridEdited(arguments);
            }
            setTimeout(callEditEvent,REFRESH_DELAY);
        }
    }
	
    
}

hax.app.visiui.HandsonGridEditor.prototype.save = function(argArray) {
	//no action for this case
	if(argArray[1] == "loadData") return;

	//update "input" data before calling update
	this.inputData = hax.core.util.deepJsonCopy(this.gridControl.getData());

	this.parentSave(this.inputData);
}

hax.app.visiui.HandsonGridEditor.prototype.cancel = function() {
	//reset the original data
	this.parentCancel();
}

//=============================
// "Package" Methods
//=============================

hax.app.visiui.HandsonGridEditor.prototype.getElement = function() {
	return this.outsideDiv;
}
	
hax.app.visiui.HandsonGridEditor.prototype.showData = function(json,editOk) {
	if((this.inputData === json)&&(editOk)) return;
	
	var oldEditOk = this.editOk;
	this.editOk = editOk;
	this.inputData = json;
	var editData = hax.core.util.deepJsonCopy(json);
	
	if((!this.gridControl)||(oldEditOk !== editOk)) {
		this.createNewGrid();
	}
	
    if(!editData) {
        editData = [[]];
    }
	this.gridControl.loadData(editData);
    
    //set the background color
    if(this.editOk) {
        this.gridDiv.style.backgroundColor = "";
    }
    else {
        this.gridDiv.style.backgroundColor = hax.app.visiui.TableEditComponent.NO_EDIT_BACKGROUND_COLOR;
    }
}

hax.app.visiui.HandsonGridEditor.prototype.destroy = function() {
	if(this.gridControl) {
        this.gridControl.destroy();
        this.gridControl = null;
    }
}

//==============================
// Private Methods
//==============================

/** This method creates a new grid. 
 * @private */
hax.app.visiui.HandsonGridEditor.prototype.createNewGrid = function() {
    if(this.gridControl) {
        this.gridControl.destroy();
        this.gridControl = null;
    }
    
    var gridOptions; 
    if(this.editOk) {
        gridOptions = {
            rowHeaders: true,
            colHeaders: true,
            contextMenu: true,
            //edit callbacks
            afterChange:this.gridEdited,
            afterCreateCol:this.delayGridEdited,
            afterCreateRow:this.delayGridEdited,
            afterRemoveCol:this.gridEdited,
            afterRemoveRow:this.gridEdited
        }
        this.gridEditable = true;
    }
    else {
        gridOptions = {
            readOnly: true,
            rowHeaders: true,
            colHeaders: true
        }
        this.gridEditable = false;
    }
        
    this.gridControl = new Handsontable(this.gridDiv,gridOptions); 
}

;

hax.app.visiui.HandsonGridMode = function(component) {
	this.component = component;
	
	this.editOk = false;
	
	var instance = this;
	var onSave = function(data) {
		return instance.onSave(data);
	}
	var onCancel = function() {
		return instance.onCancel();
	}
	
	this.editor = new hax.app.visiui.HandsonGridEditor(component,onSave,onCancel);
	
}

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.HandsonGridMode.prototype.isData = true;

hax.app.visiui.HandsonGridMode.prototype.getElement = function() {
	return this.editor.getElement();
}
	
hax.app.visiui.HandsonGridMode.prototype.showData = function(editOk) {
		
	var table = this.component.getObject();
	var json = table.getData();	

	this.editOk = editOk;
	this.editor.showData(json,editOk);
}

hax.app.visiui.HandsonGridMode.prototype.destroy = function() {
	this.editor.destroy();
}

//==============================
// internal
//==============================

hax.app.visiui.HandsonGridMode.prototype.onSave = function(data) {
	var table = this.component.getObject();
	hax.core.updatemember.updateData(table,data);
//the response should depend on this result in some way? check the error dialogs
	
	return true;
}
hax.app.visiui.HandsonGridMode.prototype.onCancel = function() {
	//reload old data
	this.showData(this.editOk);
	
	return true;
}

////////////////////////////////////////////////////////////////////////

;

hax.app.visiui.ResourceOutputMode = function(component) {
	this.component = component;
	
	this.outputElement = hax.visiui.createElement("div",null,{
		"position":"absolute",
        "top":"0px",
        "left":"0px",
		"bottom":"0px",
        "right":"0px",
		"overflow":"auto"
	});
}

/** This indicates if this element displays data or something else (code) */
hax.app.visiui.ResourceOutputMode.prototype.isData = true;

hax.app.visiui.ResourceOutputMode.prototype.getElement = function() {
	return this.outputElement;
}
	
hax.app.visiui.ResourceOutputMode.prototype.showData = function(editOk) {
	//edit ok ignored - no edit of the control data object - there is none
	
	var control = this.component.getObject();
    var resource = control.getResource();
    if((resource)&&(resource.show)) {
        resource.show();
    }   
}

hax.app.visiui.ResourceOutputMode.prototype.destroy = function() {
    var control = this.component.getObject();
    var resource = control.getResource();
    if((resource)&&(resource.hide)) {
        resource.hide();
    }
}

//==============================
// internal
//==============================

hax.app.visiui.ResourceOutputMode.prototype.onSave = function(data) {
	//no saving action
}

;
/** This method shows a configurable dialog. The layout object
 * defines the form content for the dialog. The on submit
 * function is called when submit is pressed. The on submit function should
 * return true or false, indicating whether of not to close the dialog. */
hax.app.visiui.dialog.showConfigurableDialog = function(layout,onSubmitFunction) {

    var dialog = hax.visiui.createDialog({"movable":true});
    var lineObjects = [];
    
    //this is the action for the form
    var formActions = {};
    //close form, in case actions needed
    formActions.onClose = function() {
        for(var i = 0; i < lineObjects.length; i++) {
            lineObject = lineObjects[i];
            if(lineObject.onClose) {
                lineObject.onClose();
            }
        }
        hax.visiui.closeDialog(dialog);
    }
    //cancel
    formActions.onCancel = function() {
        formActions.onClose();
    }
    //submit
    formActions.onSubmit = function() {
        //load the form data
        var formData = {};
        var lineObject;
        for(var i = 0; i < lineObjects.length; i++) {
            lineObject = lineObjects[i];
            if(lineObject.addToResult) {
                lineObject.addToResult(formData);
            }
        }
        //submit data
        var closeDialog = onSubmitFunction(formData);
        if(closeDialog) {
            formActions.onClose();
        }
    }
    
    var content = hax.visiui.createElement("div",{"className":"dialogBody"});
    for(var i = 0; i < layout.lines.length; i++) {
        var lineDef = layout.lines[i];
        
        //create line
        var lineObject = hax.app.visiui.dialog.showConfigurableDialog.createLine(lineDef,formActions);
        lineObjects.push(lineObject);
        if(lineObject.element) { //no element for "invisible" entry, which is used to pass values along
            content.appendChild(lineObject.element);
        }
    }
    
    //show dialog
    dialog.setContent(content);
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
}
    
    
    
hax.app.visiui.dialog.showConfigurableDialog.createLine = function(lineDef,formActions) {
    var lineFunction = hax.app.visiui.dialog.showConfigurableDialog.lineFunctions[lineDef.type];
    if(lineFunction) {
        return lineFunction(lineDef,formActions);
    }
    else {
        //print an error message
        alert("Error: Unknown for element type: " + lineDef.type);
        return null;
    }
}

hax.app.visiui.dialog.showConfigurableDialog.lineFunctions = {
    //linedef.type = "title"
    //linedef.title = title
    "title": function(lineDef,formActions) {
        var lineObject = {};
        //create the element
        var line = hax.visiui.createElement("div",{"className":"dialogLine"});
        line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":lineDef.title}));
        lineObject.element = line;
        
        //no addToResult or onClose
        
        return lineObject;
    },
    
    //lineDef.type = "dropdown"
    //lineDef.heading = dropdown heading (optional)
    //lineDef.entries = list of strings (or values) in dropdown
    //lineDef.initial = index of initial selection (optional)
    //lineDef.resultKey = name of result in result data
    "dropdown": function(lineDef,formActions) {
        var lineObject = {};
        //create the element
        var line = hax.visiui.createElement("div",{"className":"dialogLine"});
        if(lineDef.heading) {
            line.appendChild(document.createTextNode(lineDef.heading));
        }
        var select = hax.visiui.createElement("select");
        for(var i = 0; i < lineDef.entries.length; i++) {
            var entry = lineDef.entries[i];
            select.add(hax.visiui.createElement("option",{"text":entry}));
        }
        if(lineDef.initial) {
            select.value = lineDef.initial;
        }
        if(lineDef.disabled) {
            select.disabled = true;
        }
        line.appendChild(select);
        lineObject.element = line;
        //get result
        lineObject.addToResult = function(formData) {
            var result = select.value;
            formData[lineDef.resultKey] = result;
        }
        //no on Close
        
        return lineObject;
    },
    
    //lineDef.type = "inputElement"
    //lineDef.heading = element heading (optional)
    //lineDef.resultKey = name of result in result data
    "inputElement": function(lineDef,formActions) {
        var lineObject = {};
        //create the element
        var line = hax.visiui.createElement("div",{"className":"dialogLine"});
        if(lineDef.heading) {
            line.appendChild(document.createTextNode(lineDef.heading));
        }
        var inputElement = hax.visiui.createElement("input",{"type":"text"});
        if(lineDef.initial) {
            inputElement.value = lineDef.initial;
        }
        if(lineDef.disabled) {
            inputElement.disabled = true;
        }
        line.appendChild(inputElement);
        lineObject.element = line;
        //get result
        lineObject.addToResult = function(formData) {
            var result = inputElement.value.trim();
            formData[lineDef.resultKey] = result;
        }
        //no on Close
        
        return lineObject;
    },
    
    "aceEditor": function(lineDef,formActions) {
        
    },
    
    "radioButton": function(lineDef,formActions) {
        
    },
    
    //lineDef.type = "submit"
    //lineDef.submit = name of submit button (optional)
    //lineDef.cancel = name of cancel button (optional)
    "submit": function(lineDef,formActions) {
        var lineObject = {};
        //create the element
        var line = hax.visiui.createElement("div",{"className":"dialogLine"});
        if(lineDef.submit) {  
            line.appendChild(hax.visiui.createElement("button",
            {"className":"dialogButton","innerHTML":lineDef.submit,"onclick":formActions.onSubmit}));
        }
        if(lineDef.cancel) {
            line.appendChild(hax.visiui.createElement("button",
            {"className":"dialogButton","innerHTML":lineDef.cancel,"onclick":formActions.onCancel}));
        }
        lineObject.element = line;
        //no add to result or on close
        return lineObject;
    },
    
    //This allows the user to input a custom element
    //lineDef.type = "custom"
    //lineDef.createLineObject(formActions) - returns lineObject
    "custom": function(lineDef,formActions) {
        return lineDef.createLineObject(formActions);
    },
    
    //lineDef.type = "invisible"
    //lineDef.intial = value for this element (optional)
    //lineDef.resultKey = name of result in result data
    "invisible": function(lineDef,formActions) {
        var lineObject = {};
        //create the empty element
        lineObject.element = null;
        //get result
        lineObject.addToResult = function(formData) {
            
            formData[lineDef.resultKey] = lineDef.initial;
        }
        //no on Close
        
        return lineObject;
    }
    
    
}
    
    ;
/** This method shows a create folder dialog. The argument onCreateFunction
 * should take the folder name as an argument and return an object with the boolean entry
 * "success" and, if false, a msg in the field "msg". On success the dialog will close. */
hax.app.visiui.dialog.showCreateWorkspaceDialog = function(onCreateFunction) {

    var dialog = hax.visiui.createDialog({"movable":true});
    dialog.setTitle("&nbsp;");
    
    //add a scroll container
    var contentContainer = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
	dialog.setContent(contentContainer);
    
    var line;
    
	var content = hax.visiui.createElement("div",null,
			{
				"display":"table",
				"overflow":"hidden"
			});
	contentContainer.appendChild(content);
    
    var line;
  
    //title
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":"New Workspace"}));
    content.appendChild(line);
    
    //input
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(document.createTextNode("Name:"));
    var inputElement = hax.visiui.createElement("input",{"type":"text"});
    line.appendChild(inputElement);
    content.appendChild(line);
    
    //buttons
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var onCancel = function() {
        hax.visiui.closeDialog(dialog);
    }
    
    var onCreate = function() {
        var name = inputElement.value.trim();
        if(name.length == 0) {
            alert("The name is invalid");
            return;
        }
        
        var closeDialog = onCreateFunction(name);
        if(closeDialog) {
			hax.visiui.closeDialog(dialog);
		}    
    }
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Create","onclick":onCreate}));
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Cancel","onclick":onCancel}));
    content.appendChild(line);
    
    dialog.setContent(content);
    
    //show dialog
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
}


;

/** This method shows a open workspace dialog. The argument onOpenFunction
 * should take the folder text as an argument and return an object with the boolean entry
 * "success" and, if false, a msg in the field "msg". On success the dialog will close. */
hax.app.visiui.dialog.showOpenWorkspaceDialog = function(onOpenFunction) {

    var dialog = hax.visiui.createDialog({"resizable":true,"movable":true});
    dialog.setTitle("&nbsp;");

    //add a scroll container
    var contentContainer = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
	dialog.setContent(contentContainer);
    
    var line;
    
	var content = hax.visiui.createElement("div",null,
			{
				"display":"table",
				"overflow":"hidden"
			});
	contentContainer.appendChild(content);
  
    //title
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":"Open Workspace"}));
    content.appendChild(line);
    
    //instructions
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"innerHTML":"Paste saved workspace data in the space below."}));
    content.appendChild(line);
    
    //input
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var inputElement = hax.visiui.createElement("textarea",{"rows":"15","cols":"75"});
    line.appendChild(inputElement);
    content.appendChild(line);
    
    //buttons and handler
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var onCancel = function() {
        hax.visiui.closeDialog(dialog);
    }
    
    var onOpen = function() {
        var jsonText = inputElement.value;
        if(jsonText.length == 0) {
            alert("Please paste the file into the input field");
            return;
        }
        
        var closeDialog = onOpenFunction(jsonText);
        if(closeDialog) {
            hax.visiui.closeDialog(dialog);
        }
	}
    
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Open","onclick":onOpen}));
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Cancel","onclick":onCancel}));
    content.appendChild(line);
    
    //show dialog
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
}

;

/** This method shows a save folder dialog. I simply displays the text of
 * the workspace json for the user to copy and save elsewhere. */
hax.app.visiui.dialog.showSaveWorkspaceDialog = function(app,workspaceUI) {
    
    if((!workspaceUI)||(!workspaceUI.getWorkspace())) {
        alert("There is no workspace open.");
        return;
    }
    
    var workspaceJson = workspaceUI.toJson();
    var workspaceText = JSON.stringify(workspaceJson);

    var dialog = hax.visiui.createDialog({"resizable":true,"movable":true});
    dialog.setTitle("&nbsp;");
    
    //add a scroll container
    var contentContainer = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
	dialog.setContent(contentContainer);
    
    var line;
    
	var content = hax.visiui.createElement("div",null,
			{
				"display":"table",
				"overflow":"hidden"
			});
	contentContainer.appendChild(content);
    
    var line;
  
    //title
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":"Save Workspace"}));
    content.appendChild(line);
    
    //instructions
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"innerHTML":"Copy the data below and save it in a file to open later."}));
    content.appendChild(line);
    
    //input
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var inputElement = hax.visiui.createElement("textarea",{"value":workspaceText,"rows":"15","cols":"75"});
    line.appendChild(inputElement);
    content.appendChild(line);
    
    //buttons and handler
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var onOk = function() {
        hax.visiui.closeDialog(dialog);
    }
    
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"OK","onclick":onOk}));
    content.appendChild(line);

    dialog.setContent(content);
    
    //show dialog
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
}

;
/** This method shows a dialog to update the workspace links. */
hax.app.visiui.dialog.showUpdateLinksDialog = function(workspaceUI) {
    
    var dialog = hax.visiui.createDialog({"minimizable":true,"maximizable":true,"movable":true,"resizable":true});
            
//    //create body
//    var content = hax.visiui.createElement("div",{"className":"dialogBody"}); 
    
    //add a scroll container
    var contentContainer = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
	dialog.setContent(contentContainer);
    
    var line;
    
	var content = hax.visiui.createElement("div",null,
			{
				"display":"table",
				"overflow":"hidden"
			});
	contentContainer.appendChild(content);
    
    var line;
    
    //title
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":"Update Links"}));
    content.appendChild(line);
        
    //editor selector
    line = hax.visiui.createElement("div",{"className":"dialogLine"}); 
    var jsLinksRadio = hax.visiui.createElement("input",{"type":"radio","name":"componentContent","value":"jsLinks"});
    line.appendChild(jsLinksRadio);
    line.appendChild(document.createTextNode("JS Links"));
    content.appendChild(line);
    var cssLinksRadio = hax.visiui.createElement("input",{"type":"radio","name":"componentContent","value":"cssLinks"});
    line.appendChild(cssLinksRadio);
    line.appendChild(document.createTextNode("CSS Links"));
    
    //editors
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var editorDiv = hax.visiui.createElement("div",null,
        {
            "position":"relative",
            "width":"500px",
            "height":"300px",
            "border":"1px solid darkgray"
        });
    line.appendChild(editorDiv);
    content.appendChild(line);
        
    //create editor containers - will be hiddedn and shown
    var jsLinksEditorDiv = hax.visiui.createElement("div",null,{
        "position":"absolute",
        "top":"0px",
        "bottom":"0px",
        "right":"0px",
        "left":"0px"
    });
    var jsLinksEditor = null;
    editorDiv.appendChild(jsLinksEditorDiv);
    
    var cssLinksEditorDiv = hax.visiui.createElement("div",null,{
        "position":"absolute",
        "top":"0px",
        "bottom":"0px",
        "right":"0px",
        "left":"0px"
    });
    var cssLinksEditor = null;
    editorDiv.appendChild(cssLinksEditorDiv);
    
    //save and cancel buttons
    //buttons and handler
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var onCancel = function() {
        closeDialog();
    }
    
    var onSave = function() {
        
        var jsLinkArray;
        var cssLinkArray;

        //get js links
        if(jsLinksEditor) {
            var jsLinks = jsLinksEditor.getSession().getValue().trim();
            jsLinkArray = hax.app.visiui.dialog.createLinkArray(jsLinks);
        }
        else {
            jsLinkArray = [];
        }

        //get css links
        if(cssLinksEditor) {
            var cssLinks = cssLinksEditor.getSession().getValue().trim();
            cssLinkArray = hax.app.visiui.dialog.createLinkArray(cssLinks);
        }
        else {
            cssLinkArray = [];
        }

        //load links if we have any
        workspaceUI.setLinks(jsLinkArray,cssLinkArray);

        closeDialog();
    }
    
    var closeDialog = function() {
        hax.visiui.closeDialog(dialog);
        
        //clean up the editor
        if(jsLinksEditor) { 
            jsLinksEditor.destroy();
            jsLinksEditor = null;
        }
        if(cssLinksEditor) { 
            cssLinksEditor.destroy();
            cssLinksEditor = null;
        }  
    }
    
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Save","onclick":onSave}));
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Cancel","onclick":onCancel}));
    content.appendChild(line);
    
    dialog.setContent(content);
    
    //show dialog
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
    
    var showJsLinksFunction = function() {
        //hide the onLoad div and show the html dive
        cssLinksEditorDiv.style.display = "none";
        jsLinksEditorDiv.style.display = "";
        
        //create html editor if needed
        if(!jsLinksEditor) {
            jsLinksEditor = ace.edit(jsLinksEditorDiv);
//this stops an error message
jsLinksEditor.$blockScrolling = Infinity;
            jsLinksEditor.setTheme("ace/theme/eclipse");
            jsLinksEditor.getSession().setMode("ace/mode/text");
            //set the value
            var jsLinks = workspaceUI.getJsLinks();
            if(jsLinks) {
                var linkText = jsLinks.join("\n");
                jsLinksEditor.getSession().setValue(linkText);
            }
        }
    }
    
    var showCssLinksFunction = function() {
        //hide the onLoad div and show the html dive
        cssLinksEditorDiv.style.display = "";
        jsLinksEditorDiv.style.display = "none";
        
        //create html editor if needed
        if(!cssLinksEditor) {
            cssLinksEditor = ace.edit(cssLinksEditorDiv);
//this stops an error message
cssLinksEditor.$blockScrolling = Infinity;
            cssLinksEditor.setTheme("ace/theme/eclipse");
            cssLinksEditor.getSession().setMode("ace/mode/text");
            //set the value
            var cssLinks = workspaceUI.getCssLinks();
            if(cssLinks) {
                var linkText = cssLinks.join("\n");
                cssLinksEditor.getSession().setValue(linkText);
            }
        }
    }
    
    //show html first
    jsLinksRadio.checked = true;
    showJsLinksFunction();
    
    //radio change handler
    var onRadioChange = function() {
        if(cssLinksRadio.checked) {
            showCssLinksFunction();
        }
        else if(jsLinksRadio.checked) {
            showJsLinksFunction();
        }
    }
    
    cssLinksRadio.onchange = onRadioChange;
    jsLinksRadio.onchange = onRadioChange;
    
    //set the resize handler
    //resize the editor on window size change
    var resizeCallback = function() {
        //this needs to be fixed
        var container = content.parentElement;
        //this is kind of cludgy, I am using this as the last line and assuming it has even margins
        var margin = line.offsetLeft;
        var endPosition = line.offsetTop + line.offsetHeight + margin;
        var totalWidth = container.clientWidth - 2 * margin;
        var extraHeight = container.clientHeight - endPosition;
        //size the editor, with some arbitrary padding
        editorDiv.style.width = (totalWidth - 5) + "px";
        editorDiv.style.height = (editorDiv.offsetHeight + extraHeight - 5) + "px";
       
        if(cssLinksEditor) cssLinksEditor.resize();
        if(jsLinksEditor) jsLinksEditor.resize();
    }
    var container = content.parentElement;
    hax.visiui.setResizeListener(container, resizeCallback);
}

/** @private */
hax.app.visiui.dialog.createLinkText = function(linkArray) {
    return linkArray.join("\n");
}

/** @private */
hax.app.visiui.dialog.createLinkArray = function(linkText) {
    if((!linkText)||(linkText.length === 0)) {
        return [];
    }
    else {
        return linkText.split(/\s/);
    }
}


;
/** This method shows a dialog to select from additional components. */
hax.app.visiui.dialog.showSelectComponentDialog = function(componentList,onSelectFunction) {

    var dialog = hax.visiui.createDialog({"movable":true});
    
    //add a scroll container
    var contentContainer = hax.visiui.createElement("div",null,
        {
			"display":"block",
            "position":"relative",
            "top":"0px",
            "height":"100%",
            "overflow": "auto"
        });
	dialog.setContent(contentContainer);
    
    var line;
    
	var content = hax.visiui.createElement("div",null,
			{
				"display":"table",
				"overflow":"hidden"
			});
	contentContainer.appendChild(content);
    
    var line;
  
    //title
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(hax.visiui.createElement("div",{"className":"dialogTitle","innerHTML":"Select Component Type"}));
    content.appendChild(line);
    
    //folder selection
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    line.appendChild(document.createTextNode("Component:"));
    var select = hax.visiui.createElement("select");
    line.appendChild(select);
    for(var i = 0; i < componentList.length; i++) {
		var name = componentList[i];
		select.add(hax.visiui.createElement("option",{"text":name}));
    }
    content.appendChild(line);
    
    //buttons
    line = hax.visiui.createElement("div",{"className":"dialogLine"});
    var onCancel = function() {
        hax.visiui.closeDialog(dialog);
    }
    
    var onCreate = function() {
		var componentType = select.value;
        onSelectFunction(componentType);
        hax.visiui.closeDialog(dialog);
    }
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Create","onclick":onCreate}));
    line.appendChild(hax.visiui.createElement("button",{"className":"dialogButton","innerHTML":"Cancel","onclick":onCancel}));
    content.appendChild(line);
    
    dialog.setContent(content);  
    
    //show dialog
    dialog.show();
    
    //size the dialog to the content
    dialog.fitToContent(content);
    dialog.centerInParent();
}



