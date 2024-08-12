'use strict';var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {return typeof obj;} : function (obj) {return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;};





var _ignore = require('eslint-module-utils/ignore');
var _resolve = require('eslint-module-utils/resolve');var _resolve2 = _interopRequireDefault(_resolve);
var _visit = require('eslint-module-utils/visit');var _visit2 = _interopRequireDefault(_visit);
var _path = require('path');
var _readPkgUp2 = require('eslint-module-utils/readPkgUp');var _readPkgUp3 = _interopRequireDefault(_readPkgUp2);
var _object = require('object.values');var _object2 = _interopRequireDefault(_object);
var _arrayIncludes = require('array-includes');var _arrayIncludes2 = _interopRequireDefault(_arrayIncludes);
var _arrayPrototype = require('array.prototype.flatmap');var _arrayPrototype2 = _interopRequireDefault(_arrayPrototype);

var _builder = require('../exportMap/builder');var _builder2 = _interopRequireDefault(_builder);
var _patternCapture = require('../exportMap/patternCapture');var _patternCapture2 = _interopRequireDefault(_patternCapture);
var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}function _toConsumableArray(arr) {if (Array.isArray(arr)) {for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {arr2[i] = arr[i];}return arr2;} else {return Array.from(arr);}} /**
                                                                                                                                                                                                                                                                                                                                                                                 * @fileOverview Ensures that modules contain exports and/or all
                                                                                                                                                                                                                                                                                                                                                                                 * modules are consumed within other modules.
                                                                                                                                                                                                                                                                                                                                                                                 * @author René Fermann
                                                                                                                                                                                                                                                                                                                                                                                 */var FileEnumerator = void 0;var listFilesToProcess = void 0;
try {var _require =
  require('eslint/use-at-your-own-risk');FileEnumerator = _require.FileEnumerator;
} catch (e) {
  try {var _require2 =

    require('eslint/lib/cli-engine/file-enumerator'); // has been moved to eslint/lib/cli-engine/file-enumerator in version 6
    FileEnumerator = _require2.FileEnumerator;} catch (e) {
    try {
      // eslint/lib/util/glob-util has been moved to eslint/lib/util/glob-utils with version 5.3
      var _require3 = require('eslint/lib/util/glob-utils'),originalListFilesToProcess = _require3.listFilesToProcess;

      // Prevent passing invalid options (extensions array) to old versions of the function.
      // https://github.com/eslint/eslint/blob/v5.16.0/lib/util/glob-utils.js#L178-L280
      // https://github.com/eslint/eslint/blob/v5.2.0/lib/util/glob-util.js#L174-L269
      listFilesToProcess = function listFilesToProcess(src, extensions) {
        return originalListFilesToProcess(src, {
          extensions: extensions });

      };
    } catch (e) {var _require4 =
      require('eslint/lib/util/glob-util'),_originalListFilesToProcess = _require4.listFilesToProcess;

      listFilesToProcess = function listFilesToProcess(src, extensions) {
        var patterns = src.concat((0, _arrayPrototype2['default'])(src, function (pattern) {return extensions.map(function (extension) {return (/\*\*|\*\./.test(pattern) ? pattern : String(pattern) + '/**/*' + String(extension));});}));

        return _originalListFilesToProcess(patterns);
      };
    }
  }
}

if (FileEnumerator) {
  listFilesToProcess = function listFilesToProcess(src, extensions) {
    var e = new FileEnumerator({
      extensions: extensions });


    return Array.from(e.iterateFiles(src), function (_ref) {var filePath = _ref.filePath,ignored = _ref.ignored;return {
        ignored: ignored,
        filename: filePath };});

  };
}

var EXPORT_DEFAULT_DECLARATION = 'ExportDefaultDeclaration';
var EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';
var EXPORT_ALL_DECLARATION = 'ExportAllDeclaration';
var IMPORT_DECLARATION = 'ImportDeclaration';
var IMPORT_NAMESPACE_SPECIFIER = 'ImportNamespaceSpecifier';
var IMPORT_DEFAULT_SPECIFIER = 'ImportDefaultSpecifier';
var VARIABLE_DECLARATION = 'VariableDeclaration';
var FUNCTION_DECLARATION = 'FunctionDeclaration';
var CLASS_DECLARATION = 'ClassDeclaration';
var IDENTIFIER = 'Identifier';
var OBJECT_PATTERN = 'ObjectPattern';
var ARRAY_PATTERN = 'ArrayPattern';
var TS_INTERFACE_DECLARATION = 'TSInterfaceDeclaration';
var TS_TYPE_ALIAS_DECLARATION = 'TSTypeAliasDeclaration';
var TS_ENUM_DECLARATION = 'TSEnumDeclaration';
var DEFAULT = 'default';

function forEachDeclarationIdentifier(declaration, cb) {
  if (declaration) {
    var isTypeDeclaration = declaration.type === TS_INTERFACE_DECLARATION ||
    declaration.type === TS_TYPE_ALIAS_DECLARATION ||
    declaration.type === TS_ENUM_DECLARATION;

    if (
    declaration.type === FUNCTION_DECLARATION ||
    declaration.type === CLASS_DECLARATION ||
    isTypeDeclaration)
    {
      cb(declaration.id.name, isTypeDeclaration);
    } else if (declaration.type === VARIABLE_DECLARATION) {
      declaration.declarations.forEach(function (_ref2) {var id = _ref2.id;
        if (id.type === OBJECT_PATTERN) {
          (0, _patternCapture2['default'])(id, function (pattern) {
            if (pattern.type === IDENTIFIER) {
              cb(pattern.name, false);
            }
          });
        } else if (id.type === ARRAY_PATTERN) {
          id.elements.forEach(function (_ref3) {var name = _ref3.name;
            cb(name, false);
          });
        } else {
          cb(id.name, false);
        }
      });
    }
  }
}

/**
   * List of imports per file.
   *
   * Represented by a two-level Map to a Set of identifiers. The upper-level Map
   * keys are the paths to the modules containing the imports, while the
   * lower-level Map keys are the paths to the files which are being imported
   * from. Lastly, the Set of identifiers contains either names being imported
   * or a special AST node name listed above (e.g ImportDefaultSpecifier).
   *
   * For example, if we have a file named foo.js containing:
   *
   *   import { o2 } from './bar.js';
   *
   * Then we will have a structure that looks like:
   *
   *   Map { 'foo.js' => Map { 'bar.js' => Set { 'o2' } } }
   *
   * @type {Map<string, Map<string, Set<string>>>}
   */
var importList = new Map();

/**
                             * List of exports per file.
                             *
                             * Represented by a two-level Map to an object of metadata. The upper-level Map
                             * keys are the paths to the modules containing the exports, while the
                             * lower-level Map keys are the specific identifiers or special AST node names
                             * being exported. The leaf-level metadata object at the moment only contains a
                             * `whereUsed` property, which contains a Set of paths to modules that import
                             * the name.
                             *
                             * For example, if we have a file named bar.js containing the following exports:
                             *
                             *   const o2 = 'bar';
                             *   export { o2 };
                             *
                             * And a file named foo.js containing the following import:
                             *
                             *   import { o2 } from './bar.js';
                             *
                             * Then we will have a structure that looks like:
                             *
                             *   Map { 'bar.js' => Map { 'o2' => { whereUsed: Set { 'foo.js' } } } }
                             *
                             * @type {Map<string, Map<string, object>>}
                             */
var exportList = new Map();

var visitorKeyMap = new Map();

var ignoredFiles = new Set();
var filesOutsideSrc = new Set();

var isNodeModule = function isNodeModule(path) {return (/\/(node_modules)\//.test(path));};

/**
                                                                                             * read all files matching the patterns in src and ignoreExports
                                                                                             *
                                                                                             * return all files matching src pattern, which are not matching the ignoreExports pattern
                                                                                             */
var resolveFiles = function resolveFiles(src, ignoreExports, context) {
  var extensions = Array.from((0, _ignore.getFileExtensions)(context.settings));

  var srcFileList = listFilesToProcess(src, extensions);

  // prepare list of ignored files
  var ignoredFilesList = listFilesToProcess(ignoreExports, extensions);
  ignoredFilesList.forEach(function (_ref4) {var filename = _ref4.filename;return ignoredFiles.add(filename);});

  // prepare list of source files, don't consider files from node_modules

  return new Set(
  (0, _arrayPrototype2['default'])(srcFileList, function (_ref5) {var filename = _ref5.filename;return isNodeModule(filename) ? [] : filename;}));

};

/**
    * parse all source files and build up 2 maps containing the existing imports and exports
    */
var prepareImportsAndExports = function prepareImportsAndExports(srcFiles, context) {
  var exportAll = new Map();
  srcFiles.forEach(function (file) {
    var exports = new Map();
    var imports = new Map();
    var currentExports = _builder2['default'].get(file, context);
    if (currentExports) {var

      dependencies =




      currentExports.dependencies,reexports = currentExports.reexports,localImportList = currentExports.imports,namespace = currentExports.namespace,visitorKeys = currentExports.visitorKeys;

      visitorKeyMap.set(file, visitorKeys);
      // dependencies === export * from
      var currentExportAll = new Set();
      dependencies.forEach(function (getDependency) {
        var dependency = getDependency();
        if (dependency === null) {
          return;
        }

        currentExportAll.add(dependency.path);
      });
      exportAll.set(file, currentExportAll);

      reexports.forEach(function (value, key) {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
        var reexport = value.getImport();
        if (!reexport) {
          return;
        }
        var localImport = imports.get(reexport.path);
        var currentValue = void 0;
        if (value.local === DEFAULT) {
          currentValue = IMPORT_DEFAULT_SPECIFIER;
        } else {
          currentValue = value.local;
        }
        if (typeof localImport !== 'undefined') {
          localImport = new Set([].concat(_toConsumableArray(localImport), [currentValue]));
        } else {
          localImport = new Set([currentValue]);
        }
        imports.set(reexport.path, localImport);
      });

      localImportList.forEach(function (value, key) {
        if (isNodeModule(key)) {
          return;
        }
        var localImport = imports.get(key) || new Set();
        value.declarations.forEach(function (_ref6) {var importedSpecifiers = _ref6.importedSpecifiers;
          importedSpecifiers.forEach(function (specifier) {
            localImport.add(specifier);
          });
        });
        imports.set(key, localImport);
      });
      importList.set(file, imports);

      // build up export list only, if file is not ignored
      if (ignoredFiles.has(file)) {
        return;
      }
      namespace.forEach(function (value, key) {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
      });
    }
    exports.set(EXPORT_ALL_DECLARATION, { whereUsed: new Set() });
    exports.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed: new Set() });
    exportList.set(file, exports);
  });
  exportAll.forEach(function (value, key) {
    value.forEach(function (val) {
      var currentExports = exportList.get(val);
      if (currentExports) {
        var currentExport = currentExports.get(EXPORT_ALL_DECLARATION);
        currentExport.whereUsed.add(key);
      }
    });
  });
};

/**
    * traverse through all imports and add the respective path to the whereUsed-list
    * of the corresponding export
    */
var determineUsage = function determineUsage() {
  importList.forEach(function (listValue, listKey) {
    listValue.forEach(function (value, key) {
      var exports = exportList.get(key);
      if (typeof exports !== 'undefined') {
        value.forEach(function (currentImport) {
          var specifier = void 0;
          if (currentImport === IMPORT_NAMESPACE_SPECIFIER) {
            specifier = IMPORT_NAMESPACE_SPECIFIER;
          } else if (currentImport === IMPORT_DEFAULT_SPECIFIER) {
            specifier = IMPORT_DEFAULT_SPECIFIER;
          } else {
            specifier = currentImport;
          }
          if (typeof specifier !== 'undefined') {
            var exportStatement = exports.get(specifier);
            if (typeof exportStatement !== 'undefined') {var
              whereUsed = exportStatement.whereUsed;
              whereUsed.add(listKey);
              exports.set(specifier, { whereUsed: whereUsed });
            }
          }
        });
      }
    });
  });
};

var getSrc = function getSrc(src) {
  if (src) {
    return src;
  }
  return [process.cwd()];
};

/**
    * prepare the lists of existing imports and exports - should only be executed once at
    * the start of a new eslint run
    */
var srcFiles = void 0;
var lastPrepareKey = void 0;
var doPreparation = function doPreparation(src, ignoreExports, context) {
  var prepareKey = JSON.stringify({
    src: (src || []).sort(),
    ignoreExports: (ignoreExports || []).sort(),
    extensions: Array.from((0, _ignore.getFileExtensions)(context.settings)).sort() });

  if (prepareKey === lastPrepareKey) {
    return;
  }

  importList.clear();
  exportList.clear();
  ignoredFiles.clear();
  filesOutsideSrc.clear();

  srcFiles = resolveFiles(getSrc(src), ignoreExports, context);
  prepareImportsAndExports(srcFiles, context);
  determineUsage();
  lastPrepareKey = prepareKey;
};

var newNamespaceImportExists = function newNamespaceImportExists(specifiers) {return specifiers.some(function (_ref7) {var type = _ref7.type;return type === IMPORT_NAMESPACE_SPECIFIER;});};

var newDefaultImportExists = function newDefaultImportExists(specifiers) {return specifiers.some(function (_ref8) {var type = _ref8.type;return type === IMPORT_DEFAULT_SPECIFIER;});};

var fileIsInPkg = function fileIsInPkg(file) {var _readPkgUp =
  (0, _readPkgUp3['default'])({ cwd: file }),path = _readPkgUp.path,pkg = _readPkgUp.pkg;
  var basePath = (0, _path.dirname)(path);

  var checkPkgFieldString = function checkPkgFieldString(pkgField) {
    if ((0, _path.join)(basePath, pkgField) === file) {
      return true;
    }
  };

  var checkPkgFieldObject = function checkPkgFieldObject(pkgField) {
    var pkgFieldFiles = (0, _arrayPrototype2['default'])((0, _object2['default'])(pkgField), function (value) {return typeof value === 'boolean' ? [] : (0, _path.join)(basePath, value);});

    if ((0, _arrayIncludes2['default'])(pkgFieldFiles, file)) {
      return true;
    }
  };

  var checkPkgField = function checkPkgField(pkgField) {
    if (typeof pkgField === 'string') {
      return checkPkgFieldString(pkgField);
    }

    if ((typeof pkgField === 'undefined' ? 'undefined' : _typeof(pkgField)) === 'object') {
      return checkPkgFieldObject(pkgField);
    }
  };

  if (pkg['private'] === true) {
    return false;
  }

  if (pkg.bin) {
    if (checkPkgField(pkg.bin)) {
      return true;
    }
  }

  if (pkg.browser) {
    if (checkPkgField(pkg.browser)) {
      return true;
    }
  }

  if (pkg.main) {
    if (checkPkgFieldString(pkg.main)) {
      return true;
    }
  }

  return false;
};

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      category: 'Helpful warnings',
      description: 'Forbid modules without exports, or exports without matching import in another module.',
      url: (0, _docsUrl2['default'])('no-unused-modules') },

    schema: [{
      properties: {
        src: {
          description: 'files/paths to be analyzed (only for unused exports)',
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            minLength: 1 } },


        ignoreExports: {
          description: 'files/paths for which unused exports will not be reported (e.g module entry points)',
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            minLength: 1 } },


        missingExports: {
          description: 'report modules without any exports',
          type: 'boolean' },

        unusedExports: {
          description: 'report exports without any usage',
          type: 'boolean' },

        ignoreUnusedTypeExports: {
          description: 'ignore type exports without any usage',
          type: 'boolean' } },


      anyOf: [
      {
        properties: {
          unusedExports: { 'enum': [true] },
          src: {
            minItems: 1 } },


        required: ['unusedExports'] },

      {
        properties: {
          missingExports: { 'enum': [true] } },

        required: ['missingExports'] }] }] },





  create: function () {function create(context) {var _ref9 =






      context.options[0] || {},src = _ref9.src,_ref9$ignoreExports = _ref9.ignoreExports,ignoreExports = _ref9$ignoreExports === undefined ? [] : _ref9$ignoreExports,missingExports = _ref9.missingExports,unusedExports = _ref9.unusedExports,ignoreUnusedTypeExports = _ref9.ignoreUnusedTypeExports;

      if (unusedExports) {
        doPreparation(src, ignoreExports, context);
      }

      var file = context.getPhysicalFilename ? context.getPhysicalFilename() : context.getFilename();

      var checkExportPresence = function () {function checkExportPresence(node) {
          if (!missingExports) {
            return;
          }

          if (ignoredFiles.has(file)) {
            return;
          }

          var exportCount = exportList.get(file);
          var exportAll = exportCount.get(EXPORT_ALL_DECLARATION);
          var namespaceImports = exportCount.get(IMPORT_NAMESPACE_SPECIFIER);

          exportCount['delete'](EXPORT_ALL_DECLARATION);
          exportCount['delete'](IMPORT_NAMESPACE_SPECIFIER);
          if (exportCount.size < 1) {
            // node.body[0] === 'undefined' only happens, if everything is commented out in the file
            // being linted
            context.report(node.body[0] ? node.body[0] : node, 'No exports found');
          }
          exportCount.set(EXPORT_ALL_DECLARATION, exportAll);
          exportCount.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
        }return checkExportPresence;}();

      var checkUsage = function () {function checkUsage(node, exportedValue, isTypeExport) {
          if (!unusedExports) {
            return;
          }

          if (isTypeExport && ignoreUnusedTypeExports) {
            return;
          }

          if (ignoredFiles.has(file)) {
            return;
          }

          if (fileIsInPkg(file)) {
            return;
          }

          if (filesOutsideSrc.has(file)) {
            return;
          }

          // make sure file to be linted is included in source files
          if (!srcFiles.has(file)) {
            srcFiles = resolveFiles(getSrc(src), ignoreExports, context);
            if (!srcFiles.has(file)) {
              filesOutsideSrc.add(file);
              return;
            }
          }

          exports = exportList.get(file);

          if (!exports) {
            console.error('file `' + String(file) + '` has no exports. Please update to the latest, and if it still happens, report this on https://github.com/import-js/eslint-plugin-import/issues/2866!');
          }

          // special case: export * from
          var exportAll = exports.get(EXPORT_ALL_DECLARATION);
          if (typeof exportAll !== 'undefined' && exportedValue !== IMPORT_DEFAULT_SPECIFIER) {
            if (exportAll.whereUsed.size > 0) {
              return;
            }
          }

          // special case: namespace import
          var namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);
          if (typeof namespaceImports !== 'undefined') {
            if (namespaceImports.whereUsed.size > 0) {
              return;
            }
          }

          // exportsList will always map any imported value of 'default' to 'ImportDefaultSpecifier'
          var exportsKey = exportedValue === DEFAULT ? IMPORT_DEFAULT_SPECIFIER : exportedValue;

          var exportStatement = exports.get(exportsKey);

          var value = exportsKey === IMPORT_DEFAULT_SPECIFIER ? DEFAULT : exportsKey;

          if (typeof exportStatement !== 'undefined') {
            if (exportStatement.whereUsed.size < 1) {
              context.report(
              node, 'exported declaration \'' +
              value + '\' not used within other modules');

            }
          } else {
            context.report(
            node, 'exported declaration \'' +
            value + '\' not used within other modules');

          }
        }return checkUsage;}();

      /**
                                 * only useful for tools like vscode-eslint
                                 *
                                 * update lists of existing exports during runtime
                                 */
      var updateExportUsage = function () {function updateExportUsage(node) {
          if (ignoredFiles.has(file)) {
            return;
          }

          var exports = exportList.get(file);

          // new module has been created during runtime
          // include it in further processing
          if (typeof exports === 'undefined') {
            exports = new Map();
          }

          var newExports = new Map();
          var newExportIdentifiers = new Set();

          node.body.forEach(function (_ref10) {var type = _ref10.type,declaration = _ref10.declaration,specifiers = _ref10.specifiers;
            if (type === EXPORT_DEFAULT_DECLARATION) {
              newExportIdentifiers.add(IMPORT_DEFAULT_SPECIFIER);
            }
            if (type === EXPORT_NAMED_DECLARATION) {
              if (specifiers.length > 0) {
                specifiers.forEach(function (specifier) {
                  if (specifier.exported) {
                    newExportIdentifiers.add(specifier.exported.name || specifier.exported.value);
                  }
                });
              }
              forEachDeclarationIdentifier(declaration, function (name) {
                newExportIdentifiers.add(name);
              });
            }
          });

          // old exports exist within list of new exports identifiers: add to map of new exports
          exports.forEach(function (value, key) {
            if (newExportIdentifiers.has(key)) {
              newExports.set(key, value);
            }
          });

          // new export identifiers added: add to map of new exports
          newExportIdentifiers.forEach(function (key) {
            if (!exports.has(key)) {
              newExports.set(key, { whereUsed: new Set() });
            }
          });

          // preserve information about namespace imports
          var exportAll = exports.get(EXPORT_ALL_DECLARATION);
          var namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);

          if (typeof namespaceImports === 'undefined') {
            namespaceImports = { whereUsed: new Set() };
          }

          newExports.set(EXPORT_ALL_DECLARATION, exportAll);
          newExports.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
          exportList.set(file, newExports);
        }return updateExportUsage;}();

      /**
                                        * only useful for tools like vscode-eslint
                                        *
                                        * update lists of existing imports during runtime
                                        */
      var updateImportUsage = function () {function updateImportUsage(node) {
          if (!unusedExports) {
            return;
          }

          var oldImportPaths = importList.get(file);
          if (typeof oldImportPaths === 'undefined') {
            oldImportPaths = new Map();
          }

          var oldNamespaceImports = new Set();
          var newNamespaceImports = new Set();

          var oldExportAll = new Set();
          var newExportAll = new Set();

          var oldDefaultImports = new Set();
          var newDefaultImports = new Set();

          var oldImports = new Map();
          var newImports = new Map();
          oldImportPaths.forEach(function (value, key) {
            if (value.has(EXPORT_ALL_DECLARATION)) {
              oldExportAll.add(key);
            }
            if (value.has(IMPORT_NAMESPACE_SPECIFIER)) {
              oldNamespaceImports.add(key);
            }
            if (value.has(IMPORT_DEFAULT_SPECIFIER)) {
              oldDefaultImports.add(key);
            }
            value.forEach(function (val) {
              if (
              val !== IMPORT_NAMESPACE_SPECIFIER &&
              val !== IMPORT_DEFAULT_SPECIFIER)
              {
                oldImports.set(val, key);
              }
            });
          });

          function processDynamicImport(source) {
            if (source.type !== 'Literal') {
              return null;
            }
            var p = (0, _resolve2['default'])(source.value, context);
            if (p == null) {
              return null;
            }
            newNamespaceImports.add(p);
          }

          (0, _visit2['default'])(node, visitorKeyMap.get(file), {
            ImportExpression: function () {function ImportExpression(child) {
                processDynamicImport(child.source);
              }return ImportExpression;}(),
            CallExpression: function () {function CallExpression(child) {
                if (child.callee.type === 'Import') {
                  processDynamicImport(child.arguments[0]);
                }
              }return CallExpression;}() });


          node.body.forEach(function (astNode) {
            var resolvedPath = void 0;

            // support for export { value } from 'module'
            if (astNode.type === EXPORT_NAMED_DECLARATION) {
              if (astNode.source) {
                resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
                astNode.specifiers.forEach(function (specifier) {
                  var name = specifier.local.name || specifier.local.value;
                  if (name === DEFAULT) {
                    newDefaultImports.add(resolvedPath);
                  } else {
                    newImports.set(name, resolvedPath);
                  }
                });
              }
            }

            if (astNode.type === EXPORT_ALL_DECLARATION) {
              resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
              newExportAll.add(resolvedPath);
            }

            if (astNode.type === IMPORT_DECLARATION) {
              resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
              if (!resolvedPath) {
                return;
              }

              if (isNodeModule(resolvedPath)) {
                return;
              }

              if (newNamespaceImportExists(astNode.specifiers)) {
                newNamespaceImports.add(resolvedPath);
              }

              if (newDefaultImportExists(astNode.specifiers)) {
                newDefaultImports.add(resolvedPath);
              }

              astNode.specifiers.
              filter(function (specifier) {return specifier.type !== IMPORT_DEFAULT_SPECIFIER && specifier.type !== IMPORT_NAMESPACE_SPECIFIER;}).
              forEach(function (specifier) {
                newImports.set(specifier.imported.name || specifier.imported.value, resolvedPath);
              });
            }
          });

          newExportAll.forEach(function (value) {
            if (!oldExportAll.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(EXPORT_ALL_DECLARATION);
              oldImportPaths.set(value, imports);

              var _exports = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports !== 'undefined') {
                currentExport = _exports.get(EXPORT_ALL_DECLARATION);
              } else {
                _exports = new Map();
                exportList.set(value, _exports);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports.set(EXPORT_ALL_DECLARATION, { whereUsed: whereUsed });
              }
            }
          });

          oldExportAll.forEach(function (value) {
            if (!newExportAll.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](EXPORT_ALL_DECLARATION);

              var _exports2 = exportList.get(value);
              if (typeof _exports2 !== 'undefined') {
                var currentExport = _exports2.get(EXPORT_ALL_DECLARATION);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newDefaultImports.forEach(function (value) {
            if (!oldDefaultImports.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(IMPORT_DEFAULT_SPECIFIER);
              oldImportPaths.set(value, imports);

              var _exports3 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports3 !== 'undefined') {
                currentExport = _exports3.get(IMPORT_DEFAULT_SPECIFIER);
              } else {
                _exports3 = new Map();
                exportList.set(value, _exports3);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports3.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: whereUsed });
              }
            }
          });

          oldDefaultImports.forEach(function (value) {
            if (!newDefaultImports.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](IMPORT_DEFAULT_SPECIFIER);

              var _exports4 = exportList.get(value);
              if (typeof _exports4 !== 'undefined') {
                var currentExport = _exports4.get(IMPORT_DEFAULT_SPECIFIER);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newNamespaceImports.forEach(function (value) {
            if (!oldNamespaceImports.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(IMPORT_NAMESPACE_SPECIFIER);
              oldImportPaths.set(value, imports);

              var _exports5 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports5 !== 'undefined') {
                currentExport = _exports5.get(IMPORT_NAMESPACE_SPECIFIER);
              } else {
                _exports5 = new Map();
                exportList.set(value, _exports5);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports5.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed: whereUsed });
              }
            }
          });

          oldNamespaceImports.forEach(function (value) {
            if (!newNamespaceImports.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](IMPORT_NAMESPACE_SPECIFIER);

              var _exports6 = exportList.get(value);
              if (typeof _exports6 !== 'undefined') {
                var currentExport = _exports6.get(IMPORT_NAMESPACE_SPECIFIER);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newImports.forEach(function (value, key) {
            if (!oldImports.has(key)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(key);
              oldImportPaths.set(value, imports);

              var _exports7 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports7 !== 'undefined') {
                currentExport = _exports7.get(key);
              } else {
                _exports7 = new Map();
                exportList.set(value, _exports7);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports7.set(key, { whereUsed: whereUsed });
              }
            }
          });

          oldImports.forEach(function (value, key) {
            if (!newImports.has(key)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](key);

              var _exports8 = exportList.get(value);
              if (typeof _exports8 !== 'undefined') {
                var currentExport = _exports8.get(key);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });
        }return updateImportUsage;}();

      return {
        'Program:exit': function () {function ProgramExit(node) {
            updateExportUsage(node);
            updateImportUsage(node);
            checkExportPresence(node);
          }return ProgramExit;}(),
        ExportDefaultDeclaration: function () {function ExportDefaultDeclaration(node) {
            checkUsage(node, IMPORT_DEFAULT_SPECIFIER, false);
          }return ExportDefaultDeclaration;}(),
        ExportNamedDeclaration: function () {function ExportNamedDeclaration(node) {
            node.specifiers.forEach(function (specifier) {
              checkUsage(specifier, specifier.exported.name || specifier.exported.value, false);
            });
            forEachDeclarationIdentifier(node.declaration, function (name, isTypeExport) {
              checkUsage(node, name, isTypeExport);
            });
          }return ExportNamedDeclaration;}() };

    }return create;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby11bnVzZWQtbW9kdWxlcy5qcyJdLCJuYW1lcyI6WyJGaWxlRW51bWVyYXRvciIsImxpc3RGaWxlc1RvUHJvY2VzcyIsInJlcXVpcmUiLCJlIiwib3JpZ2luYWxMaXN0RmlsZXNUb1Byb2Nlc3MiLCJzcmMiLCJleHRlbnNpb25zIiwicGF0dGVybnMiLCJjb25jYXQiLCJwYXR0ZXJuIiwibWFwIiwiZXh0ZW5zaW9uIiwidGVzdCIsIkFycmF5IiwiZnJvbSIsIml0ZXJhdGVGaWxlcyIsImZpbGVQYXRoIiwiaWdub3JlZCIsImZpbGVuYW1lIiwiRVhQT1JUX0RFRkFVTFRfREVDTEFSQVRJT04iLCJFWFBPUlRfTkFNRURfREVDTEFSQVRJT04iLCJFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OIiwiSU1QT1JUX0RFQ0xBUkFUSU9OIiwiSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIiLCJJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIiLCJWQVJJQUJMRV9ERUNMQVJBVElPTiIsIkZVTkNUSU9OX0RFQ0xBUkFUSU9OIiwiQ0xBU1NfREVDTEFSQVRJT04iLCJJREVOVElGSUVSIiwiT0JKRUNUX1BBVFRFUk4iLCJBUlJBWV9QQVRURVJOIiwiVFNfSU5URVJGQUNFX0RFQ0xBUkFUSU9OIiwiVFNfVFlQRV9BTElBU19ERUNMQVJBVElPTiIsIlRTX0VOVU1fREVDTEFSQVRJT04iLCJERUZBVUxUIiwiZm9yRWFjaERlY2xhcmF0aW9uSWRlbnRpZmllciIsImRlY2xhcmF0aW9uIiwiY2IiLCJpc1R5cGVEZWNsYXJhdGlvbiIsInR5cGUiLCJpZCIsIm5hbWUiLCJkZWNsYXJhdGlvbnMiLCJmb3JFYWNoIiwiZWxlbWVudHMiLCJpbXBvcnRMaXN0IiwiTWFwIiwiZXhwb3J0TGlzdCIsInZpc2l0b3JLZXlNYXAiLCJpZ25vcmVkRmlsZXMiLCJTZXQiLCJmaWxlc091dHNpZGVTcmMiLCJpc05vZGVNb2R1bGUiLCJwYXRoIiwicmVzb2x2ZUZpbGVzIiwiaWdub3JlRXhwb3J0cyIsImNvbnRleHQiLCJzZXR0aW5ncyIsInNyY0ZpbGVMaXN0IiwiaWdub3JlZEZpbGVzTGlzdCIsImFkZCIsInByZXBhcmVJbXBvcnRzQW5kRXhwb3J0cyIsInNyY0ZpbGVzIiwiZXhwb3J0QWxsIiwiZmlsZSIsImV4cG9ydHMiLCJpbXBvcnRzIiwiY3VycmVudEV4cG9ydHMiLCJFeHBvcnRNYXBCdWlsZGVyIiwiZ2V0IiwiZGVwZW5kZW5jaWVzIiwicmVleHBvcnRzIiwibG9jYWxJbXBvcnRMaXN0IiwibmFtZXNwYWNlIiwidmlzaXRvcktleXMiLCJzZXQiLCJjdXJyZW50RXhwb3J0QWxsIiwiZ2V0RGVwZW5kZW5jeSIsImRlcGVuZGVuY3kiLCJ2YWx1ZSIsImtleSIsIndoZXJlVXNlZCIsInJlZXhwb3J0IiwiZ2V0SW1wb3J0IiwibG9jYWxJbXBvcnQiLCJjdXJyZW50VmFsdWUiLCJsb2NhbCIsImltcG9ydGVkU3BlY2lmaWVycyIsInNwZWNpZmllciIsImhhcyIsInZhbCIsImN1cnJlbnRFeHBvcnQiLCJkZXRlcm1pbmVVc2FnZSIsImxpc3RWYWx1ZSIsImxpc3RLZXkiLCJjdXJyZW50SW1wb3J0IiwiZXhwb3J0U3RhdGVtZW50IiwiZ2V0U3JjIiwicHJvY2VzcyIsImN3ZCIsImxhc3RQcmVwYXJlS2V5IiwiZG9QcmVwYXJhdGlvbiIsInByZXBhcmVLZXkiLCJKU09OIiwic3RyaW5naWZ5Iiwic29ydCIsImNsZWFyIiwibmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzIiwic3BlY2lmaWVycyIsInNvbWUiLCJuZXdEZWZhdWx0SW1wb3J0RXhpc3RzIiwiZmlsZUlzSW5Qa2ciLCJwa2ciLCJiYXNlUGF0aCIsImNoZWNrUGtnRmllbGRTdHJpbmciLCJwa2dGaWVsZCIsImNoZWNrUGtnRmllbGRPYmplY3QiLCJwa2dGaWVsZEZpbGVzIiwiY2hlY2tQa2dGaWVsZCIsImJpbiIsImJyb3dzZXIiLCJtYWluIiwibW9kdWxlIiwibWV0YSIsImRvY3MiLCJjYXRlZ29yeSIsImRlc2NyaXB0aW9uIiwidXJsIiwic2NoZW1hIiwicHJvcGVydGllcyIsInVuaXF1ZUl0ZW1zIiwiaXRlbXMiLCJtaW5MZW5ndGgiLCJtaXNzaW5nRXhwb3J0cyIsInVudXNlZEV4cG9ydHMiLCJpZ25vcmVVbnVzZWRUeXBlRXhwb3J0cyIsImFueU9mIiwibWluSXRlbXMiLCJyZXF1aXJlZCIsImNyZWF0ZSIsIm9wdGlvbnMiLCJnZXRQaHlzaWNhbEZpbGVuYW1lIiwiZ2V0RmlsZW5hbWUiLCJjaGVja0V4cG9ydFByZXNlbmNlIiwibm9kZSIsImV4cG9ydENvdW50IiwibmFtZXNwYWNlSW1wb3J0cyIsInNpemUiLCJyZXBvcnQiLCJib2R5IiwiY2hlY2tVc2FnZSIsImV4cG9ydGVkVmFsdWUiLCJpc1R5cGVFeHBvcnQiLCJjb25zb2xlIiwiZXJyb3IiLCJleHBvcnRzS2V5IiwidXBkYXRlRXhwb3J0VXNhZ2UiLCJuZXdFeHBvcnRzIiwibmV3RXhwb3J0SWRlbnRpZmllcnMiLCJsZW5ndGgiLCJleHBvcnRlZCIsInVwZGF0ZUltcG9ydFVzYWdlIiwib2xkSW1wb3J0UGF0aHMiLCJvbGROYW1lc3BhY2VJbXBvcnRzIiwibmV3TmFtZXNwYWNlSW1wb3J0cyIsIm9sZEV4cG9ydEFsbCIsIm5ld0V4cG9ydEFsbCIsIm9sZERlZmF1bHRJbXBvcnRzIiwibmV3RGVmYXVsdEltcG9ydHMiLCJvbGRJbXBvcnRzIiwibmV3SW1wb3J0cyIsInByb2Nlc3NEeW5hbWljSW1wb3J0Iiwic291cmNlIiwicCIsIkltcG9ydEV4cHJlc3Npb24iLCJjaGlsZCIsIkNhbGxFeHByZXNzaW9uIiwiY2FsbGVlIiwiYXJndW1lbnRzIiwiYXN0Tm9kZSIsInJlc29sdmVkUGF0aCIsInJhdyIsInJlcGxhY2UiLCJmaWx0ZXIiLCJpbXBvcnRlZCIsIkV4cG9ydERlZmF1bHREZWNsYXJhdGlvbiIsIkV4cG9ydE5hbWVkRGVjbGFyYXRpb24iXSwibWFwcGluZ3MiOiI7Ozs7OztBQU1BO0FBQ0Esc0Q7QUFDQSxrRDtBQUNBO0FBQ0EsMkQ7QUFDQSx1QztBQUNB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R0FBUixDQUFZVyxHQUFaLENBQXRCO0FBQ0Esb0JBQUksT0FBT1csYUFBUCxLQUF5QixXQUE3QixFQUEwQztBQUN4Q0EsZ0NBQWNWLFNBQWQsV0FBK0JqQixJQUEvQjtBQUNEO0FBQ0Y7QUFDRjtBQUNGLFdBYkQ7QUFjRCxTQTNSSyw0QkFBTjs7QUE2UkEsYUFBTztBQUNMLHNCQURLLG9DQUNVZ0YsSUFEVixFQUNnQjtBQUNuQlksOEJBQWtCWixJQUFsQjtBQUNBaUIsOEJBQWtCakIsSUFBbEI7QUFDQUQsZ0NBQW9CQyxJQUFwQjtBQUNELFdBTEk7QUFNTHlDLGdDQU5LLGlEQU1vQnpDLElBTnBCLEVBTTBCO0FBQzdCTSx1QkFBV04sSUFBWCxFQUFpQnhILHdCQUFqQixFQUEyQyxLQUEzQztBQUNELFdBUkk7QUFTTGtLLDhCQVRLLCtDQVNrQjFDLElBVGxCLEVBU3dCO0FBQzNCQSxpQkFBS3BDLFVBQUwsQ0FBZ0JqRSxPQUFoQixDQUF3QixVQUFDNkMsU0FBRCxFQUFlO0FBQ3JDOEQseUJBQVc5RCxTQUFYLEVBQXNCQSxVQUFVd0UsUUFBVixDQUFtQnZILElBQW5CLElBQTJCK0MsVUFBVXdFLFFBQVYsQ0FBbUJqRixLQUFwRSxFQUEyRSxLQUEzRTtBQUNELGFBRkQ7QUFHQTVDLHlDQUE2QjZHLEtBQUs1RyxXQUFsQyxFQUErQyxVQUFDSyxJQUFELEVBQU8rRyxZQUFQLEVBQXdCO0FBQ3JFRix5QkFBV04sSUFBWCxFQUFpQnZHLElBQWpCLEVBQXVCK0csWUFBdkI7QUFDRCxhQUZEO0FBR0QsV0FoQkksbUNBQVA7O0FBa0JELEtBcGlCYyxtQkFBakIiLCJmaWxlIjoibm8tdW51c2VkLW1vZHVsZXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgRW5zdXJlcyB0aGF0IG1vZHVsZXMgY29udGFpbiBleHBvcnRzIGFuZC9vciBhbGxcbiAqIG1vZHVsZXMgYXJlIGNvbnN1bWVkIHdpdGhpbiBvdGhlciBtb2R1bGVzLlxuICogQGF1dGhvciBSZW7DqSBGZXJtYW5uXG4gKi9cblxuaW1wb3J0IHsgZ2V0RmlsZUV4dGVuc2lvbnMgfSBmcm9tICdlc2xpbnQtbW9kdWxlLXV0aWxzL2lnbm9yZSc7XG5pbXBvcnQgcmVzb2x2ZSBmcm9tICdlc2xpbnQtbW9kdWxlLXV0aWxzL3Jlc29sdmUnO1xuaW1wb3J0IHZpc2l0IGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvdmlzaXQnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHJlYWRQa2dVcCBmcm9tICdlc2xpbnQtbW9kdWxlLXV0aWxzL3JlYWRQa2dVcCc7XG5pbXBvcnQgdmFsdWVzIGZyb20gJ29iamVjdC52YWx1ZXMnO1xuaW1wb3J0IGluY2x1ZGVzIGZyb20gJ2FycmF5LWluY2x1ZGVzJztcbmltcG9ydCBmbGF0TWFwIGZyb20gJ2FycmF5LnByb3RvdHlwZS5mbGF0bWFwJztcblxuaW1wb3J0IEV4cG9ydE1hcEJ1aWxkZXIgZnJvbSAnLi4vZXhwb3J0TWFwL2J1aWxkZXInO1xuaW1wb3J0IHJlY3Vyc2l2ZVBhdHRlcm5DYXB0dXJlIGZyb20gJy4uL2V4cG9ydE1hcC9wYXR0ZXJuQ2FwdHVyZSc7XG5pbXBvcnQgZG9jc1VybCBmcm9tICcuLi9kb2NzVXJsJztcblxubGV0IEZpbGVFbnVtZXJhdG9yO1xubGV0IGxpc3RGaWxlc1RvUHJvY2VzcztcblxudHJ5IHtcbiAgKHsgRmlsZUVudW1lcmF0b3IgfSA9IHJlcXVpcmUoJ2VzbGludC91c2UtYXQteW91ci1vd24tcmlzaycpKTtcbn0gY2F0Y2ggKGUpIHtcbiAgdHJ5IHtcbiAgICAvLyBoYXMgYmVlbiBtb3ZlZCB0byBlc2xpbnQvbGliL2NsaS1lbmdpbmUvZmlsZS1lbnVtZXJhdG9yIGluIHZlcnNpb24gNlxuICAgICh7IEZpbGVFbnVtZXJhdG9yIH0gPSByZXF1aXJlKCdlc2xpbnQvbGliL2NsaS1lbmdpbmUvZmlsZS1lbnVtZXJhdG9yJykpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIGVzbGludC9saWIvdXRpbC9nbG9iLXV0aWwgaGFzIGJlZW4gbW92ZWQgdG8gZXNsaW50L2xpYi91dGlsL2dsb2ItdXRpbHMgd2l0aCB2ZXJzaW9uIDUuM1xuICAgICAgY29uc3QgeyBsaXN0RmlsZXNUb1Byb2Nlc3M6IG9yaWdpbmFsTGlzdEZpbGVzVG9Qcm9jZXNzIH0gPSByZXF1aXJlKCdlc2xpbnQvbGliL3V0aWwvZ2xvYi11dGlscycpO1xuXG4gICAgICAvLyBQcmV2ZW50IHBhc3NpbmcgaW52YWxpZCBvcHRpb25zIChleHRlbnNpb25zIGFycmF5KSB0byBvbGQgdmVyc2lvbnMgb2YgdGhlIGZ1bmN0aW9uLlxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2VzbGludC9lc2xpbnQvYmxvYi92NS4xNi4wL2xpYi91dGlsL2dsb2ItdXRpbHMuanMjTDE3OC1MMjgwXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZXNsaW50L2VzbGludC9ibG9iL3Y1LjIuMC9saWIvdXRpbC9nbG9iLXV0aWwuanMjTDE3NC1MMjY5XG4gICAgICBsaXN0RmlsZXNUb1Byb2Nlc3MgPSBmdW5jdGlvbiAoc3JjLCBleHRlbnNpb25zKSB7XG4gICAgICAgIHJldHVybiBvcmlnaW5hbExpc3RGaWxlc1RvUHJvY2VzcyhzcmMsIHtcbiAgICAgICAgICBleHRlbnNpb25zLFxuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgeyBsaXN0RmlsZXNUb1Byb2Nlc3M6IG9yaWdpbmFsTGlzdEZpbGVzVG9Qcm9jZXNzIH0gPSByZXF1aXJlKCdlc2xpbnQvbGliL3V0aWwvZ2xvYi11dGlsJyk7XG5cbiAgICAgIGxpc3RGaWxlc1RvUHJvY2VzcyA9IGZ1bmN0aW9uIChzcmMsIGV4dGVuc2lvbnMpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBzcmMuY29uY2F0KGZsYXRNYXAoc3JjLCAocGF0dGVybikgPT4gZXh0ZW5zaW9ucy5tYXAoKGV4dGVuc2lvbikgPT4gKC9cXCpcXCp8XFwqXFwuLykudGVzdChwYXR0ZXJuKSA/IHBhdHRlcm4gOiBgJHtwYXR0ZXJufS8qKi8qJHtleHRlbnNpb259YCkpKTtcblxuICAgICAgICByZXR1cm4gb3JpZ2luYWxMaXN0RmlsZXNUb1Byb2Nlc3MocGF0dGVybnMpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cbn1cblxuaWYgKEZpbGVFbnVtZXJhdG9yKSB7XG4gIGxpc3RGaWxlc1RvUHJvY2VzcyA9IGZ1bmN0aW9uIChzcmMsIGV4dGVuc2lvbnMpIHtcbiAgICBjb25zdCBlID0gbmV3IEZpbGVFbnVtZXJhdG9yKHtcbiAgICAgIGV4dGVuc2lvbnMsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gQXJyYXkuZnJvbShlLml0ZXJhdGVGaWxlcyhzcmMpLCAoeyBmaWxlUGF0aCwgaWdub3JlZCB9KSA9PiAoe1xuICAgICAgaWdub3JlZCxcbiAgICAgIGZpbGVuYW1lOiBmaWxlUGF0aCxcbiAgICB9KSk7XG4gIH07XG59XG5cbmNvbnN0IEVYUE9SVF9ERUZBVUxUX0RFQ0xBUkFUSU9OID0gJ0V4cG9ydERlZmF1bHREZWNsYXJhdGlvbic7XG5jb25zdCBFWFBPUlRfTkFNRURfREVDTEFSQVRJT04gPSAnRXhwb3J0TmFtZWREZWNsYXJhdGlvbic7XG5jb25zdCBFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OID0gJ0V4cG9ydEFsbERlY2xhcmF0aW9uJztcbmNvbnN0IElNUE9SVF9ERUNMQVJBVElPTiA9ICdJbXBvcnREZWNsYXJhdGlvbic7XG5jb25zdCBJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiA9ICdJbXBvcnROYW1lc3BhY2VTcGVjaWZpZXInO1xuY29uc3QgSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSID0gJ0ltcG9ydERlZmF1bHRTcGVjaWZpZXInO1xuY29uc3QgVkFSSUFCTEVfREVDTEFSQVRJT04gPSAnVmFyaWFibGVEZWNsYXJhdGlvbic7XG5jb25zdCBGVU5DVElPTl9ERUNMQVJBVElPTiA9ICdGdW5jdGlvbkRlY2xhcmF0aW9uJztcbmNvbnN0IENMQVNTX0RFQ0xBUkFUSU9OID0gJ0NsYXNzRGVjbGFyYXRpb24nO1xuY29uc3QgSURFTlRJRklFUiA9ICdJZGVudGlmaWVyJztcbmNvbnN0IE9CSkVDVF9QQVRURVJOID0gJ09iamVjdFBhdHRlcm4nO1xuY29uc3QgQVJSQVlfUEFUVEVSTiA9ICdBcnJheVBhdHRlcm4nO1xuY29uc3QgVFNfSU5URVJGQUNFX0RFQ0xBUkFUSU9OID0gJ1RTSW50ZXJmYWNlRGVjbGFyYXRpb24nO1xuY29uc3QgVFNfVFlQRV9BTElBU19ERUNMQVJBVElPTiA9ICdUU1R5cGVBbGlhc0RlY2xhcmF0aW9uJztcbmNvbnN0IFRTX0VOVU1fREVDTEFSQVRJT04gPSAnVFNFbnVtRGVjbGFyYXRpb24nO1xuY29uc3QgREVGQVVMVCA9ICdkZWZhdWx0JztcblxuZnVuY3Rpb24gZm9yRWFjaERlY2xhcmF0aW9uSWRlbnRpZmllcihkZWNsYXJhdGlvbiwgY2IpIHtcbiAgaWYgKGRlY2xhcmF0aW9uKSB7XG4gICAgY29uc3QgaXNUeXBlRGVjbGFyYXRpb24gPSBkZWNsYXJhdGlvbi50eXBlID09PSBUU19JTlRFUkZBQ0VfREVDTEFSQVRJT05cbiAgICAgIHx8IGRlY2xhcmF0aW9uLnR5cGUgPT09IFRTX1RZUEVfQUxJQVNfREVDTEFSQVRJT05cbiAgICAgIHx8IGRlY2xhcmF0aW9uLnR5cGUgPT09IFRTX0VOVU1fREVDTEFSQVRJT047XG5cbiAgICBpZiAoXG4gICAgICBkZWNsYXJhdGlvbi50eXBlID09PSBGVU5DVElPTl9ERUNMQVJBVElPTlxuICAgICAgfHwgZGVjbGFyYXRpb24udHlwZSA9PT0gQ0xBU1NfREVDTEFSQVRJT05cbiAgICAgIHx8IGlzVHlwZURlY2xhcmF0aW9uXG4gICAgKSB7XG4gICAgICBjYihkZWNsYXJhdGlvbi5pZC5uYW1lLCBpc1R5cGVEZWNsYXJhdGlvbik7XG4gICAgfSBlbHNlIGlmIChkZWNsYXJhdGlvbi50eXBlID09PSBWQVJJQUJMRV9ERUNMQVJBVElPTikge1xuICAgICAgZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goKHsgaWQgfSkgPT4ge1xuICAgICAgICBpZiAoaWQudHlwZSA9PT0gT0JKRUNUX1BBVFRFUk4pIHtcbiAgICAgICAgICByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZShpZCwgKHBhdHRlcm4pID0+IHtcbiAgICAgICAgICAgIGlmIChwYXR0ZXJuLnR5cGUgPT09IElERU5USUZJRVIpIHtcbiAgICAgICAgICAgICAgY2IocGF0dGVybi5uYW1lLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaWQudHlwZSA9PT0gQVJSQVlfUEFUVEVSTikge1xuICAgICAgICAgIGlkLmVsZW1lbnRzLmZvckVhY2goKHsgbmFtZSB9KSA9PiB7XG4gICAgICAgICAgICBjYihuYW1lLCBmYWxzZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2IoaWQubmFtZSwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBMaXN0IG9mIGltcG9ydHMgcGVyIGZpbGUuXG4gKlxuICogUmVwcmVzZW50ZWQgYnkgYSB0d28tbGV2ZWwgTWFwIHRvIGEgU2V0IG9mIGlkZW50aWZpZXJzLiBUaGUgdXBwZXItbGV2ZWwgTWFwXG4gKiBrZXlzIGFyZSB0aGUgcGF0aHMgdG8gdGhlIG1vZHVsZXMgY29udGFpbmluZyB0aGUgaW1wb3J0cywgd2hpbGUgdGhlXG4gKiBsb3dlci1sZXZlbCBNYXAga2V5cyBhcmUgdGhlIHBhdGhzIHRvIHRoZSBmaWxlcyB3aGljaCBhcmUgYmVpbmcgaW1wb3J0ZWRcbiAqIGZyb20uIExhc3RseSwgdGhlIFNldCBvZiBpZGVudGlmaWVycyBjb250YWlucyBlaXRoZXIgbmFtZXMgYmVpbmcgaW1wb3J0ZWRcbiAqIG9yIGEgc3BlY2lhbCBBU1Qgbm9kZSBuYW1lIGxpc3RlZCBhYm92ZSAoZS5nIEltcG9ydERlZmF1bHRTcGVjaWZpZXIpLlxuICpcbiAqIEZvciBleGFtcGxlLCBpZiB3ZSBoYXZlIGEgZmlsZSBuYW1lZCBmb28uanMgY29udGFpbmluZzpcbiAqXG4gKiAgIGltcG9ydCB7IG8yIH0gZnJvbSAnLi9iYXIuanMnO1xuICpcbiAqIFRoZW4gd2Ugd2lsbCBoYXZlIGEgc3RydWN0dXJlIHRoYXQgbG9va3MgbGlrZTpcbiAqXG4gKiAgIE1hcCB7ICdmb28uanMnID0+IE1hcCB7ICdiYXIuanMnID0+IFNldCB7ICdvMicgfSB9IH1cbiAqXG4gKiBAdHlwZSB7TWFwPHN0cmluZywgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+Pn1cbiAqL1xuY29uc3QgaW1wb3J0TGlzdCA9IG5ldyBNYXAoKTtcblxuLyoqXG4gKiBMaXN0IG9mIGV4cG9ydHMgcGVyIGZpbGUuXG4gKlxuICogUmVwcmVzZW50ZWQgYnkgYSB0d28tbGV2ZWwgTWFwIHRvIGFuIG9iamVjdCBvZiBtZXRhZGF0YS4gVGhlIHVwcGVyLWxldmVsIE1hcFxuICoga2V5cyBhcmUgdGhlIHBhdGhzIHRvIHRoZSBtb2R1bGVzIGNvbnRhaW5pbmcgdGhlIGV4cG9ydHMsIHdoaWxlIHRoZVxuICogbG93ZXItbGV2ZWwgTWFwIGtleXMgYXJlIHRoZSBzcGVjaWZpYyBpZGVudGlmaWVycyBvciBzcGVjaWFsIEFTVCBub2RlIG5hbWVzXG4gKiBiZWluZyBleHBvcnRlZC4gVGhlIGxlYWYtbGV2ZWwgbWV0YWRhdGEgb2JqZWN0IGF0IHRoZSBtb21lbnQgb25seSBjb250YWlucyBhXG4gKiBgd2hlcmVVc2VkYCBwcm9wZXJ0eSwgd2hpY2ggY29udGFpbnMgYSBTZXQgb2YgcGF0aHMgdG8gbW9kdWxlcyB0aGF0IGltcG9ydFxuICogdGhlIG5hbWUuXG4gKlxuICogRm9yIGV4YW1wbGUsIGlmIHdlIGhhdmUgYSBmaWxlIG5hbWVkIGJhci5qcyBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgZXhwb3J0czpcbiAqXG4gKiAgIGNvbnN0IG8yID0gJ2Jhcic7XG4gKiAgIGV4cG9ydCB7IG8yIH07XG4gKlxuICogQW5kIGEgZmlsZSBuYW1lZCBmb28uanMgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIGltcG9ydDpcbiAqXG4gKiAgIGltcG9ydCB7IG8yIH0gZnJvbSAnLi9iYXIuanMnO1xuICpcbiAqIFRoZW4gd2Ugd2lsbCBoYXZlIGEgc3RydWN0dXJlIHRoYXQgbG9va3MgbGlrZTpcbiAqXG4gKiAgIE1hcCB7ICdiYXIuanMnID0+IE1hcCB7ICdvMicgPT4geyB3aGVyZVVzZWQ6IFNldCB7ICdmb28uanMnIH0gfSB9IH1cbiAqXG4gKiBAdHlwZSB7TWFwPHN0cmluZywgTWFwPHN0cmluZywgb2JqZWN0Pj59XG4gKi9cbmNvbnN0IGV4cG9ydExpc3QgPSBuZXcgTWFwKCk7XG5cbmNvbnN0IHZpc2l0b3JLZXlNYXAgPSBuZXcgTWFwKCk7XG5cbmNvbnN0IGlnbm9yZWRGaWxlcyA9IG5ldyBTZXQoKTtcbmNvbnN0IGZpbGVzT3V0c2lkZVNyYyA9IG5ldyBTZXQoKTtcblxuY29uc3QgaXNOb2RlTW9kdWxlID0gKHBhdGgpID0+ICgvXFwvKG5vZGVfbW9kdWxlcylcXC8vKS50ZXN0KHBhdGgpO1xuXG4vKipcbiAqIHJlYWQgYWxsIGZpbGVzIG1hdGNoaW5nIHRoZSBwYXR0ZXJucyBpbiBzcmMgYW5kIGlnbm9yZUV4cG9ydHNcbiAqXG4gKiByZXR1cm4gYWxsIGZpbGVzIG1hdGNoaW5nIHNyYyBwYXR0ZXJuLCB3aGljaCBhcmUgbm90IG1hdGNoaW5nIHRoZSBpZ25vcmVFeHBvcnRzIHBhdHRlcm5cbiAqL1xuY29uc3QgcmVzb2x2ZUZpbGVzID0gKHNyYywgaWdub3JlRXhwb3J0cywgY29udGV4dCkgPT4ge1xuICBjb25zdCBleHRlbnNpb25zID0gQXJyYXkuZnJvbShnZXRGaWxlRXh0ZW5zaW9ucyhjb250ZXh0LnNldHRpbmdzKSk7XG5cbiAgY29uc3Qgc3JjRmlsZUxpc3QgPSBsaXN0RmlsZXNUb1Byb2Nlc3Moc3JjLCBleHRlbnNpb25zKTtcblxuICAvLyBwcmVwYXJlIGxpc3Qgb2YgaWdub3JlZCBmaWxlc1xuICBjb25zdCBpZ25vcmVkRmlsZXNMaXN0ID0gbGlzdEZpbGVzVG9Qcm9jZXNzKGlnbm9yZUV4cG9ydHMsIGV4dGVuc2lvbnMpO1xuICBpZ25vcmVkRmlsZXNMaXN0LmZvckVhY2goKHsgZmlsZW5hbWUgfSkgPT4gaWdub3JlZEZpbGVzLmFkZChmaWxlbmFtZSkpO1xuXG4gIC8vIHByZXBhcmUgbGlzdCBvZiBzb3VyY2UgZmlsZXMsIGRvbid0IGNvbnNpZGVyIGZpbGVzIGZyb20gbm9kZV9tb2R1bGVzXG5cbiAgcmV0dXJuIG5ldyBTZXQoXG4gICAgZmxhdE1hcChzcmNGaWxlTGlzdCwgKHsgZmlsZW5hbWUgfSkgPT4gaXNOb2RlTW9kdWxlKGZpbGVuYW1lKSA/IFtdIDogZmlsZW5hbWUpLFxuICApO1xufTtcblxuLyoqXG4gKiBwYXJzZSBhbGwgc291cmNlIGZpbGVzIGFuZCBidWlsZCB1cCAyIG1hcHMgY29udGFpbmluZyB0aGUgZXhpc3RpbmcgaW1wb3J0cyBhbmQgZXhwb3J0c1xuICovXG5jb25zdCBwcmVwYXJlSW1wb3J0c0FuZEV4cG9ydHMgPSAoc3JjRmlsZXMsIGNvbnRleHQpID0+IHtcbiAgY29uc3QgZXhwb3J0QWxsID0gbmV3IE1hcCgpO1xuICBzcmNGaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgY29uc3QgZXhwb3J0cyA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBpbXBvcnRzID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGN1cnJlbnRFeHBvcnRzID0gRXhwb3J0TWFwQnVpbGRlci5nZXQoZmlsZSwgY29udGV4dCk7XG4gICAgaWYgKGN1cnJlbnRFeHBvcnRzKSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRlcGVuZGVuY2llcyxcbiAgICAgICAgcmVleHBvcnRzLFxuICAgICAgICBpbXBvcnRzOiBsb2NhbEltcG9ydExpc3QsXG4gICAgICAgIG5hbWVzcGFjZSxcbiAgICAgICAgdmlzaXRvcktleXMsXG4gICAgICB9ID0gY3VycmVudEV4cG9ydHM7XG5cbiAgICAgIHZpc2l0b3JLZXlNYXAuc2V0KGZpbGUsIHZpc2l0b3JLZXlzKTtcbiAgICAgIC8vIGRlcGVuZGVuY2llcyA9PT0gZXhwb3J0ICogZnJvbVxuICAgICAgY29uc3QgY3VycmVudEV4cG9ydEFsbCA9IG5ldyBTZXQoKTtcbiAgICAgIGRlcGVuZGVuY2llcy5mb3JFYWNoKChnZXREZXBlbmRlbmN5KSA9PiB7XG4gICAgICAgIGNvbnN0IGRlcGVuZGVuY3kgPSBnZXREZXBlbmRlbmN5KCk7XG4gICAgICAgIGlmIChkZXBlbmRlbmN5ID09PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY3VycmVudEV4cG9ydEFsbC5hZGQoZGVwZW5kZW5jeS5wYXRoKTtcbiAgICAgIH0pO1xuICAgICAgZXhwb3J0QWxsLnNldChmaWxlLCBjdXJyZW50RXhwb3J0QWxsKTtcblxuICAgICAgcmVleHBvcnRzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gREVGQVVMVCkge1xuICAgICAgICAgIGV4cG9ydHMuc2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQ6IG5ldyBTZXQoKSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVleHBvcnQgPSAgdmFsdWUuZ2V0SW1wb3J0KCk7XG4gICAgICAgIGlmICghcmVleHBvcnQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGxvY2FsSW1wb3J0ID0gaW1wb3J0cy5nZXQocmVleHBvcnQucGF0aCk7XG4gICAgICAgIGxldCBjdXJyZW50VmFsdWU7XG4gICAgICAgIGlmICh2YWx1ZS5sb2NhbCA9PT0gREVGQVVMVCkge1xuICAgICAgICAgIGN1cnJlbnRWYWx1ZSA9IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjdXJyZW50VmFsdWUgPSB2YWx1ZS5sb2NhbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGxvY2FsSW1wb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsSW1wb3J0ID0gbmV3IFNldChbLi4ubG9jYWxJbXBvcnQsIGN1cnJlbnRWYWx1ZV0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvY2FsSW1wb3J0ID0gbmV3IFNldChbY3VycmVudFZhbHVlXSk7XG4gICAgICAgIH1cbiAgICAgICAgaW1wb3J0cy5zZXQocmVleHBvcnQucGF0aCwgbG9jYWxJbXBvcnQpO1xuICAgICAgfSk7XG5cbiAgICAgIGxvY2FsSW1wb3J0TGlzdC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChpc05vZGVNb2R1bGUoa2V5KSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsb2NhbEltcG9ydCA9IGltcG9ydHMuZ2V0KGtleSkgfHwgbmV3IFNldCgpO1xuICAgICAgICB2YWx1ZS5kZWNsYXJhdGlvbnMuZm9yRWFjaCgoeyBpbXBvcnRlZFNwZWNpZmllcnMgfSkgPT4ge1xuICAgICAgICAgIGltcG9ydGVkU3BlY2lmaWVycy5mb3JFYWNoKChzcGVjaWZpZXIpID0+IHtcbiAgICAgICAgICAgIGxvY2FsSW1wb3J0LmFkZChzcGVjaWZpZXIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgaW1wb3J0cy5zZXQoa2V5LCBsb2NhbEltcG9ydCk7XG4gICAgICB9KTtcbiAgICAgIGltcG9ydExpc3Quc2V0KGZpbGUsIGltcG9ydHMpO1xuXG4gICAgICAvLyBidWlsZCB1cCBleHBvcnQgbGlzdCBvbmx5LCBpZiBmaWxlIGlzIG5vdCBpZ25vcmVkXG4gICAgICBpZiAoaWdub3JlZEZpbGVzLmhhcyhmaWxlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBuYW1lc3BhY2UuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSBERUZBVUxUKSB7XG4gICAgICAgICAgZXhwb3J0cy5zZXQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSLCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGV4cG9ydHMuc2V0KGtleSwgeyB3aGVyZVVzZWQ6IG5ldyBTZXQoKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIGV4cG9ydHMuc2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04sIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSk7XG4gICAgZXhwb3J0cy5zZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIsIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSk7XG4gICAgZXhwb3J0TGlzdC5zZXQoZmlsZSwgZXhwb3J0cyk7XG4gIH0pO1xuICBleHBvcnRBbGwuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgIHZhbHVlLmZvckVhY2goKHZhbCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudEV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWwpO1xuICAgICAgaWYgKGN1cnJlbnRFeHBvcnRzKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRFeHBvcnQgPSBjdXJyZW50RXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmFkZChrZXkpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogdHJhdmVyc2UgdGhyb3VnaCBhbGwgaW1wb3J0cyBhbmQgYWRkIHRoZSByZXNwZWN0aXZlIHBhdGggdG8gdGhlIHdoZXJlVXNlZC1saXN0XG4gKiBvZiB0aGUgY29ycmVzcG9uZGluZyBleHBvcnRcbiAqL1xuY29uc3QgZGV0ZXJtaW5lVXNhZ2UgPSAoKSA9PiB7XG4gIGltcG9ydExpc3QuZm9yRWFjaCgobGlzdFZhbHVlLCBsaXN0S2V5KSA9PiB7XG4gICAgbGlzdFZhbHVlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldChrZXkpO1xuICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB2YWx1ZS5mb3JFYWNoKChjdXJyZW50SW1wb3J0KSA9PiB7XG4gICAgICAgICAgbGV0IHNwZWNpZmllcjtcbiAgICAgICAgICBpZiAoY3VycmVudEltcG9ydCA9PT0gSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpIHtcbiAgICAgICAgICAgIHNwZWNpZmllciA9IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY3VycmVudEltcG9ydCA9PT0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKSB7XG4gICAgICAgICAgICBzcGVjaWZpZXIgPSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNwZWNpZmllciA9IGN1cnJlbnRJbXBvcnQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2Ygc3BlY2lmaWVyICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgZXhwb3J0U3RhdGVtZW50ID0gZXhwb3J0cy5nZXQoc3BlY2lmaWVyKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZXhwb3J0U3RhdGVtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICBjb25zdCB7IHdoZXJlVXNlZCB9ID0gZXhwb3J0U3RhdGVtZW50O1xuICAgICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGxpc3RLZXkpO1xuICAgICAgICAgICAgICBleHBvcnRzLnNldChzcGVjaWZpZXIsIHsgd2hlcmVVc2VkIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuY29uc3QgZ2V0U3JjID0gKHNyYykgPT4ge1xuICBpZiAoc3JjKSB7XG4gICAgcmV0dXJuIHNyYztcbiAgfVxuICByZXR1cm4gW3Byb2Nlc3MuY3dkKCldO1xufTtcblxuLyoqXG4gKiBwcmVwYXJlIHRoZSBsaXN0cyBvZiBleGlzdGluZyBpbXBvcnRzIGFuZCBleHBvcnRzIC0gc2hvdWxkIG9ubHkgYmUgZXhlY3V0ZWQgb25jZSBhdFxuICogdGhlIHN0YXJ0IG9mIGEgbmV3IGVzbGludCBydW5cbiAqL1xubGV0IHNyY0ZpbGVzO1xubGV0IGxhc3RQcmVwYXJlS2V5O1xuY29uc3QgZG9QcmVwYXJhdGlvbiA9IChzcmMsIGlnbm9yZUV4cG9ydHMsIGNvbnRleHQpID0+IHtcbiAgY29uc3QgcHJlcGFyZUtleSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBzcmM6IChzcmMgfHwgW10pLnNvcnQoKSxcbiAgICBpZ25vcmVFeHBvcnRzOiAoaWdub3JlRXhwb3J0cyB8fCBbXSkuc29ydCgpLFxuICAgIGV4dGVuc2lvbnM6IEFycmF5LmZyb20oZ2V0RmlsZUV4dGVuc2lvbnMoY29udGV4dC5zZXR0aW5ncykpLnNvcnQoKSxcbiAgfSk7XG4gIGlmIChwcmVwYXJlS2V5ID09PSBsYXN0UHJlcGFyZUtleSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGltcG9ydExpc3QuY2xlYXIoKTtcbiAgZXhwb3J0TGlzdC5jbGVhcigpO1xuICBpZ25vcmVkRmlsZXMuY2xlYXIoKTtcbiAgZmlsZXNPdXRzaWRlU3JjLmNsZWFyKCk7XG5cbiAgc3JjRmlsZXMgPSByZXNvbHZlRmlsZXMoZ2V0U3JjKHNyYyksIGlnbm9yZUV4cG9ydHMsIGNvbnRleHQpO1xuICBwcmVwYXJlSW1wb3J0c0FuZEV4cG9ydHMoc3JjRmlsZXMsIGNvbnRleHQpO1xuICBkZXRlcm1pbmVVc2FnZSgpO1xuICBsYXN0UHJlcGFyZUtleSA9IHByZXBhcmVLZXk7XG59O1xuXG5jb25zdCBuZXdOYW1lc3BhY2VJbXBvcnRFeGlzdHMgPSAoc3BlY2lmaWVycykgPT4gc3BlY2lmaWVycy5zb21lKCh7IHR5cGUgfSkgPT4gdHlwZSA9PT0gSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuXG5jb25zdCBuZXdEZWZhdWx0SW1wb3J0RXhpc3RzID0gKHNwZWNpZmllcnMpID0+IHNwZWNpZmllcnMuc29tZSgoeyB0eXBlIH0pID0+IHR5cGUgPT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG5cbmNvbnN0IGZpbGVJc0luUGtnID0gKGZpbGUpID0+IHtcbiAgY29uc3QgeyBwYXRoLCBwa2cgfSA9IHJlYWRQa2dVcCh7IGN3ZDogZmlsZSB9KTtcbiAgY29uc3QgYmFzZVBhdGggPSBkaXJuYW1lKHBhdGgpO1xuXG4gIGNvbnN0IGNoZWNrUGtnRmllbGRTdHJpbmcgPSAocGtnRmllbGQpID0+IHtcbiAgICBpZiAoam9pbihiYXNlUGF0aCwgcGtnRmllbGQpID09PSBmaWxlKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgY2hlY2tQa2dGaWVsZE9iamVjdCA9IChwa2dGaWVsZCkgPT4ge1xuICAgIGNvbnN0IHBrZ0ZpZWxkRmlsZXMgPSBmbGF0TWFwKHZhbHVlcyhwa2dGaWVsZCksICh2YWx1ZSkgPT4gdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgPyBbXSA6IGpvaW4oYmFzZVBhdGgsIHZhbHVlKSk7XG5cbiAgICBpZiAoaW5jbHVkZXMocGtnRmllbGRGaWxlcywgZmlsZSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBjaGVja1BrZ0ZpZWxkID0gKHBrZ0ZpZWxkKSA9PiB7XG4gICAgaWYgKHR5cGVvZiBwa2dGaWVsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBjaGVja1BrZ0ZpZWxkU3RyaW5nKHBrZ0ZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHBrZ0ZpZWxkID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIGNoZWNrUGtnRmllbGRPYmplY3QocGtnRmllbGQpO1xuICAgIH1cbiAgfTtcblxuICBpZiAocGtnLnByaXZhdGUgPT09IHRydWUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAocGtnLmJpbikge1xuICAgIGlmIChjaGVja1BrZ0ZpZWxkKHBrZy5iaW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAocGtnLmJyb3dzZXIpIHtcbiAgICBpZiAoY2hlY2tQa2dGaWVsZChwa2cuYnJvd3NlcikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwa2cubWFpbikge1xuICAgIGlmIChjaGVja1BrZ0ZpZWxkU3RyaW5nKHBrZy5tYWluKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1ldGE6IHtcbiAgICB0eXBlOiAnc3VnZ2VzdGlvbicsXG4gICAgZG9jczoge1xuICAgICAgY2F0ZWdvcnk6ICdIZWxwZnVsIHdhcm5pbmdzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRm9yYmlkIG1vZHVsZXMgd2l0aG91dCBleHBvcnRzLCBvciBleHBvcnRzIHdpdGhvdXQgbWF0Y2hpbmcgaW1wb3J0IGluIGFub3RoZXIgbW9kdWxlLicsXG4gICAgICB1cmw6IGRvY3NVcmwoJ25vLXVudXNlZC1tb2R1bGVzJyksXG4gICAgfSxcbiAgICBzY2hlbWE6IFt7XG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIHNyYzoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnZmlsZXMvcGF0aHMgdG8gYmUgYW5hbHl6ZWQgKG9ubHkgZm9yIHVudXNlZCBleHBvcnRzKScsXG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICB1bmlxdWVJdGVtczogdHJ1ZSxcbiAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICBtaW5MZW5ndGg6IDEsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgaWdub3JlRXhwb3J0czoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnZmlsZXMvcGF0aHMgZm9yIHdoaWNoIHVudXNlZCBleHBvcnRzIHdpbGwgbm90IGJlIHJlcG9ydGVkIChlLmcgbW9kdWxlIGVudHJ5IHBvaW50cyknLFxuICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgdW5pcXVlSXRlbXM6IHRydWUsXG4gICAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgbWluTGVuZ3RoOiAxLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG1pc3NpbmdFeHBvcnRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdyZXBvcnQgbW9kdWxlcyB3aXRob3V0IGFueSBleHBvcnRzJyxcbiAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgIH0sXG4gICAgICAgIHVudXNlZEV4cG9ydHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ3JlcG9ydCBleHBvcnRzIHdpdGhvdXQgYW55IHVzYWdlJyxcbiAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgIH0sXG4gICAgICAgIGlnbm9yZVVudXNlZFR5cGVFeHBvcnRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdpZ25vcmUgdHlwZSBleHBvcnRzIHdpdGhvdXQgYW55IHVzYWdlJyxcbiAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgYW55T2Y6IFtcbiAgICAgICAge1xuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIHVudXNlZEV4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgICAgICBzcmM6IHtcbiAgICAgICAgICAgICAgbWluSXRlbXM6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVxdWlyZWQ6IFsndW51c2VkRXhwb3J0cyddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgbWlzc2luZ0V4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXF1aXJlZDogWydtaXNzaW5nRXhwb3J0cyddLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9XSxcbiAgfSxcblxuICBjcmVhdGUoY29udGV4dCkge1xuICAgIGNvbnN0IHtcbiAgICAgIHNyYyxcbiAgICAgIGlnbm9yZUV4cG9ydHMgPSBbXSxcbiAgICAgIG1pc3NpbmdFeHBvcnRzLFxuICAgICAgdW51c2VkRXhwb3J0cyxcbiAgICAgIGlnbm9yZVVudXNlZFR5cGVFeHBvcnRzLFxuICAgIH0gPSBjb250ZXh0Lm9wdGlvbnNbMF0gfHwge307XG5cbiAgICBpZiAodW51c2VkRXhwb3J0cykge1xuICAgICAgZG9QcmVwYXJhdGlvbihzcmMsIGlnbm9yZUV4cG9ydHMsIGNvbnRleHQpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSBjb250ZXh0LmdldFBoeXNpY2FsRmlsZW5hbWUgPyBjb250ZXh0LmdldFBoeXNpY2FsRmlsZW5hbWUoKSA6IGNvbnRleHQuZ2V0RmlsZW5hbWUoKTtcblxuICAgIGNvbnN0IGNoZWNrRXhwb3J0UHJlc2VuY2UgPSAobm9kZSkgPT4ge1xuICAgICAgaWYgKCFtaXNzaW5nRXhwb3J0cykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChpZ25vcmVkRmlsZXMuaGFzKGZpbGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXhwb3J0Q291bnQgPSBleHBvcnRMaXN0LmdldChmaWxlKTtcbiAgICAgIGNvbnN0IGV4cG9ydEFsbCA9IGV4cG9ydENvdW50LmdldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcbiAgICAgIGNvbnN0IG5hbWVzcGFjZUltcG9ydHMgPSBleHBvcnRDb3VudC5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuXG4gICAgICBleHBvcnRDb3VudC5kZWxldGUoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICBleHBvcnRDb3VudC5kZWxldGUoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuICAgICAgaWYgKGV4cG9ydENvdW50LnNpemUgPCAxKSB7XG4gICAgICAgIC8vIG5vZGUuYm9keVswXSA9PT0gJ3VuZGVmaW5lZCcgb25seSBoYXBwZW5zLCBpZiBldmVyeXRoaW5nIGlzIGNvbW1lbnRlZCBvdXQgaW4gdGhlIGZpbGVcbiAgICAgICAgLy8gYmVpbmcgbGludGVkXG4gICAgICAgIGNvbnRleHQucmVwb3J0KG5vZGUuYm9keVswXSA/IG5vZGUuYm9keVswXSA6IG5vZGUsICdObyBleHBvcnRzIGZvdW5kJyk7XG4gICAgICB9XG4gICAgICBleHBvcnRDb3VudC5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgZXhwb3J0QWxsKTtcbiAgICAgIGV4cG9ydENvdW50LnNldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiwgbmFtZXNwYWNlSW1wb3J0cyk7XG4gICAgfTtcblxuICAgIGNvbnN0IGNoZWNrVXNhZ2UgPSAobm9kZSwgZXhwb3J0ZWRWYWx1ZSwgaXNUeXBlRXhwb3J0KSA9PiB7XG4gICAgICBpZiAoIXVudXNlZEV4cG9ydHMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNUeXBlRXhwb3J0ICYmIGlnbm9yZVVudXNlZFR5cGVFeHBvcnRzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKGlnbm9yZWRGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoZmlsZUlzSW5Qa2coZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoZmlsZXNPdXRzaWRlU3JjLmhhcyhmaWxlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIG1ha2Ugc3VyZSBmaWxlIHRvIGJlIGxpbnRlZCBpcyBpbmNsdWRlZCBpbiBzb3VyY2UgZmlsZXNcbiAgICAgIGlmICghc3JjRmlsZXMuaGFzKGZpbGUpKSB7XG4gICAgICAgIHNyY0ZpbGVzID0gcmVzb2x2ZUZpbGVzKGdldFNyYyhzcmMpLCBpZ25vcmVFeHBvcnRzLCBjb250ZXh0KTtcbiAgICAgICAgaWYgKCFzcmNGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgICBmaWxlc091dHNpZGVTcmMuYWRkKGZpbGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQoZmlsZSk7XG5cbiAgICAgIGlmICghZXhwb3J0cykge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBmaWxlIFxcYCR7ZmlsZX1cXGAgaGFzIG5vIGV4cG9ydHMuIFBsZWFzZSB1cGRhdGUgdG8gdGhlIGxhdGVzdCwgYW5kIGlmIGl0IHN0aWxsIGhhcHBlbnMsIHJlcG9ydCB0aGlzIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS9pbXBvcnQtanMvZXNsaW50LXBsdWdpbi1pbXBvcnQvaXNzdWVzLzI4NjYhYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIHNwZWNpYWwgY2FzZTogZXhwb3J0ICogZnJvbVxuICAgICAgY29uc3QgZXhwb3J0QWxsID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICBpZiAodHlwZW9mIGV4cG9ydEFsbCAhPT0gJ3VuZGVmaW5lZCcgJiYgZXhwb3J0ZWRWYWx1ZSAhPT0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKSB7XG4gICAgICAgIGlmIChleHBvcnRBbGwud2hlcmVVc2VkLnNpemUgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHNwZWNpYWwgY2FzZTogbmFtZXNwYWNlIGltcG9ydFxuICAgICAgY29uc3QgbmFtZXNwYWNlSW1wb3J0cyA9IGV4cG9ydHMuZ2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcbiAgICAgIGlmICh0eXBlb2YgbmFtZXNwYWNlSW1wb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKG5hbWVzcGFjZUltcG9ydHMud2hlcmVVc2VkLnNpemUgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGV4cG9ydHNMaXN0IHdpbGwgYWx3YXlzIG1hcCBhbnkgaW1wb3J0ZWQgdmFsdWUgb2YgJ2RlZmF1bHQnIHRvICdJbXBvcnREZWZhdWx0U3BlY2lmaWVyJ1xuICAgICAgY29uc3QgZXhwb3J0c0tleSA9IGV4cG9ydGVkVmFsdWUgPT09IERFRkFVTFQgPyBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIgOiBleHBvcnRlZFZhbHVlO1xuXG4gICAgICBjb25zdCBleHBvcnRTdGF0ZW1lbnQgPSBleHBvcnRzLmdldChleHBvcnRzS2V5KTtcblxuICAgICAgY29uc3QgdmFsdWUgPSBleHBvcnRzS2V5ID09PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIgPyBERUZBVUxUIDogZXhwb3J0c0tleTtcblxuICAgICAgaWYgKHR5cGVvZiBleHBvcnRTdGF0ZW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmIChleHBvcnRTdGF0ZW1lbnQud2hlcmVVc2VkLnNpemUgPCAxKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQoXG4gICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgYGV4cG9ydGVkIGRlY2xhcmF0aW9uICcke3ZhbHVlfScgbm90IHVzZWQgd2l0aGluIG90aGVyIG1vZHVsZXNgLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgYGV4cG9ydGVkIGRlY2xhcmF0aW9uICcke3ZhbHVlfScgbm90IHVzZWQgd2l0aGluIG90aGVyIG1vZHVsZXNgLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBvbmx5IHVzZWZ1bCBmb3IgdG9vbHMgbGlrZSB2c2NvZGUtZXNsaW50XG4gICAgICpcbiAgICAgKiB1cGRhdGUgbGlzdHMgb2YgZXhpc3RpbmcgZXhwb3J0cyBkdXJpbmcgcnVudGltZVxuICAgICAqL1xuICAgIGNvbnN0IHVwZGF0ZUV4cG9ydFVzYWdlID0gKG5vZGUpID0+IHtcbiAgICAgIGlmIChpZ25vcmVkRmlsZXMuaGFzKGZpbGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldChmaWxlKTtcblxuICAgICAgLy8gbmV3IG1vZHVsZSBoYXMgYmVlbiBjcmVhdGVkIGR1cmluZyBydW50aW1lXG4gICAgICAvLyBpbmNsdWRlIGl0IGluIGZ1cnRoZXIgcHJvY2Vzc2luZ1xuICAgICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXdFeHBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgY29uc3QgbmV3RXhwb3J0SWRlbnRpZmllcnMgPSBuZXcgU2V0KCk7XG5cbiAgICAgIG5vZGUuYm9keS5mb3JFYWNoKCh7IHR5cGUsIGRlY2xhcmF0aW9uLCBzcGVjaWZpZXJzIH0pID0+IHtcbiAgICAgICAgaWYgKHR5cGUgPT09IEVYUE9SVF9ERUZBVUxUX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgbmV3RXhwb3J0SWRlbnRpZmllcnMuYWRkKElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGUgPT09IEVYUE9SVF9OQU1FRF9ERUNMQVJBVElPTikge1xuICAgICAgICAgIGlmIChzcGVjaWZpZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNwZWNpZmllcnMuZm9yRWFjaCgoc3BlY2lmaWVyKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChzcGVjaWZpZXIuZXhwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBuZXdFeHBvcnRJZGVudGlmaWVycy5hZGQoc3BlY2lmaWVyLmV4cG9ydGVkLm5hbWUgfHwgc3BlY2lmaWVyLmV4cG9ydGVkLnZhbHVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGZvckVhY2hEZWNsYXJhdGlvbklkZW50aWZpZXIoZGVjbGFyYXRpb24sIChuYW1lKSA9PiB7XG4gICAgICAgICAgICBuZXdFeHBvcnRJZGVudGlmaWVycy5hZGQobmFtZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBvbGQgZXhwb3J0cyBleGlzdCB3aXRoaW4gbGlzdCBvZiBuZXcgZXhwb3J0cyBpZGVudGlmaWVyczogYWRkIHRvIG1hcCBvZiBuZXcgZXhwb3J0c1xuICAgICAgZXhwb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChuZXdFeHBvcnRJZGVudGlmaWVycy5oYXMoa2V5KSkge1xuICAgICAgICAgIG5ld0V4cG9ydHMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gbmV3IGV4cG9ydCBpZGVudGlmaWVycyBhZGRlZDogYWRkIHRvIG1hcCBvZiBuZXcgZXhwb3J0c1xuICAgICAgbmV3RXhwb3J0SWRlbnRpZmllcnMuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICAgIGlmICghZXhwb3J0cy5oYXMoa2V5KSkge1xuICAgICAgICAgIG5ld0V4cG9ydHMuc2V0KGtleSwgeyB3aGVyZVVzZWQ6IG5ldyBTZXQoKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIHByZXNlcnZlIGluZm9ybWF0aW9uIGFib3V0IG5hbWVzcGFjZSBpbXBvcnRzXG4gICAgICBjb25zdCBleHBvcnRBbGwgPSBleHBvcnRzLmdldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcbiAgICAgIGxldCBuYW1lc3BhY2VJbXBvcnRzID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuXG4gICAgICBpZiAodHlwZW9mIG5hbWVzcGFjZUltcG9ydHMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIG5hbWVzcGFjZUltcG9ydHMgPSB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH07XG4gICAgICB9XG5cbiAgICAgIG5ld0V4cG9ydHMuc2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04sIGV4cG9ydEFsbCk7XG4gICAgICBuZXdFeHBvcnRzLnNldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiwgbmFtZXNwYWNlSW1wb3J0cyk7XG4gICAgICBleHBvcnRMaXN0LnNldChmaWxlLCBuZXdFeHBvcnRzKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogb25seSB1c2VmdWwgZm9yIHRvb2xzIGxpa2UgdnNjb2RlLWVzbGludFxuICAgICAqXG4gICAgICogdXBkYXRlIGxpc3RzIG9mIGV4aXN0aW5nIGltcG9ydHMgZHVyaW5nIHJ1bnRpbWVcbiAgICAgKi9cbiAgICBjb25zdCB1cGRhdGVJbXBvcnRVc2FnZSA9IChub2RlKSA9PiB7XG4gICAgICBpZiAoIXVudXNlZEV4cG9ydHMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgb2xkSW1wb3J0UGF0aHMgPSBpbXBvcnRMaXN0LmdldChmaWxlKTtcbiAgICAgIGlmICh0eXBlb2Ygb2xkSW1wb3J0UGF0aHMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIG9sZEltcG9ydFBhdGhzID0gbmV3IE1hcCgpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvbGROYW1lc3BhY2VJbXBvcnRzID0gbmV3IFNldCgpO1xuICAgICAgY29uc3QgbmV3TmFtZXNwYWNlSW1wb3J0cyA9IG5ldyBTZXQoKTtcblxuICAgICAgY29uc3Qgb2xkRXhwb3J0QWxsID0gbmV3IFNldCgpO1xuICAgICAgY29uc3QgbmV3RXhwb3J0QWxsID0gbmV3IFNldCgpO1xuXG4gICAgICBjb25zdCBvbGREZWZhdWx0SW1wb3J0cyA9IG5ldyBTZXQoKTtcbiAgICAgIGNvbnN0IG5ld0RlZmF1bHRJbXBvcnRzID0gbmV3IFNldCgpO1xuXG4gICAgICBjb25zdCBvbGRJbXBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgY29uc3QgbmV3SW1wb3J0cyA9IG5ldyBNYXAoKTtcbiAgICAgIG9sZEltcG9ydFBhdGhzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKHZhbHVlLmhhcyhFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKSkge1xuICAgICAgICAgIG9sZEV4cG9ydEFsbC5hZGQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodmFsdWUuaGFzKElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKSkge1xuICAgICAgICAgIG9sZE5hbWVzcGFjZUltcG9ydHMuYWRkKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHZhbHVlLmhhcyhJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpKSB7XG4gICAgICAgICAgb2xkRGVmYXVsdEltcG9ydHMuYWRkKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWUuZm9yRWFjaCgodmFsKSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgdmFsICE9PSBJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUlxuICAgICAgICAgICAgJiYgdmFsICE9PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVJcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZEltcG9ydHMuc2V0KHZhbCwga2V5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGZ1bmN0aW9uIHByb2Nlc3NEeW5hbWljSW1wb3J0KHNvdXJjZSkge1xuICAgICAgICBpZiAoc291cmNlLnR5cGUgIT09ICdMaXRlcmFsJykge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHAgPSByZXNvbHZlKHNvdXJjZS52YWx1ZSwgY29udGV4dCk7XG4gICAgICAgIGlmIChwID09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBuZXdOYW1lc3BhY2VJbXBvcnRzLmFkZChwKTtcbiAgICAgIH1cblxuICAgICAgdmlzaXQobm9kZSwgdmlzaXRvcktleU1hcC5nZXQoZmlsZSksIHtcbiAgICAgICAgSW1wb3J0RXhwcmVzc2lvbihjaGlsZCkge1xuICAgICAgICAgIHByb2Nlc3NEeW5hbWljSW1wb3J0KGNoaWxkLnNvdXJjZSk7XG4gICAgICAgIH0sXG4gICAgICAgIENhbGxFeHByZXNzaW9uKGNoaWxkKSB7XG4gICAgICAgICAgaWYgKGNoaWxkLmNhbGxlZS50eXBlID09PSAnSW1wb3J0Jykge1xuICAgICAgICAgICAgcHJvY2Vzc0R5bmFtaWNJbXBvcnQoY2hpbGQuYXJndW1lbnRzWzBdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgbm9kZS5ib2R5LmZvckVhY2goKGFzdE5vZGUpID0+IHtcbiAgICAgICAgbGV0IHJlc29sdmVkUGF0aDtcblxuICAgICAgICAvLyBzdXBwb3J0IGZvciBleHBvcnQgeyB2YWx1ZSB9IGZyb20gJ21vZHVsZSdcbiAgICAgICAgaWYgKGFzdE5vZGUudHlwZSA9PT0gRVhQT1JUX05BTUVEX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgaWYgKGFzdE5vZGUuc291cmNlKSB7XG4gICAgICAgICAgICByZXNvbHZlZFBhdGggPSByZXNvbHZlKGFzdE5vZGUuc291cmNlLnJhdy5yZXBsYWNlKC8oJ3xcIikvZywgJycpLCBjb250ZXh0KTtcbiAgICAgICAgICAgIGFzdE5vZGUuc3BlY2lmaWVycy5mb3JFYWNoKChzcGVjaWZpZXIpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHNwZWNpZmllci5sb2NhbC5uYW1lIHx8IHNwZWNpZmllci5sb2NhbC52YWx1ZTtcbiAgICAgICAgICAgICAgaWYgKG5hbWUgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICAgICAgICBuZXdEZWZhdWx0SW1wb3J0cy5hZGQocmVzb2x2ZWRQYXRoKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXdJbXBvcnRzLnNldChuYW1lLCByZXNvbHZlZFBhdGgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXN0Tm9kZS50eXBlID09PSBFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgcmVzb2x2ZWRQYXRoID0gcmVzb2x2ZShhc3ROb2RlLnNvdXJjZS5yYXcucmVwbGFjZSgvKCd8XCIpL2csICcnKSwgY29udGV4dCk7XG4gICAgICAgICAgbmV3RXhwb3J0QWxsLmFkZChyZXNvbHZlZFBhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFzdE5vZGUudHlwZSA9PT0gSU1QT1JUX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgcmVzb2x2ZWRQYXRoID0gcmVzb2x2ZShhc3ROb2RlLnNvdXJjZS5yYXcucmVwbGFjZSgvKCd8XCIpL2csICcnKSwgY29udGV4dCk7XG4gICAgICAgICAgaWYgKCFyZXNvbHZlZFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoaXNOb2RlTW9kdWxlKHJlc29sdmVkUGF0aCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzKGFzdE5vZGUuc3BlY2lmaWVycykpIHtcbiAgICAgICAgICAgIG5ld05hbWVzcGFjZUltcG9ydHMuYWRkKHJlc29sdmVkUGF0aCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5ld0RlZmF1bHRJbXBvcnRFeGlzdHMoYXN0Tm9kZS5zcGVjaWZpZXJzKSkge1xuICAgICAgICAgICAgbmV3RGVmYXVsdEltcG9ydHMuYWRkKHJlc29sdmVkUGF0aCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYXN0Tm9kZS5zcGVjaWZpZXJzXG4gICAgICAgICAgICAuZmlsdGVyKChzcGVjaWZpZXIpID0+IHNwZWNpZmllci50eXBlICE9PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIgJiYgc3BlY2lmaWVyLnR5cGUgIT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKVxuICAgICAgICAgICAgLmZvckVhY2goKHNwZWNpZmllcikgPT4ge1xuICAgICAgICAgICAgICBuZXdJbXBvcnRzLnNldChzcGVjaWZpZXIuaW1wb3J0ZWQubmFtZSB8fCBzcGVjaWZpZXIuaW1wb3J0ZWQudmFsdWUsIHJlc29sdmVkUGF0aCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIG5ld0V4cG9ydEFsbC5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBpZiAoIW9sZEV4cG9ydEFsbC5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgaW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGltcG9ydHMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGltcG9ydHMuYWRkKEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuICAgICAgICAgIG9sZEltcG9ydFBhdGhzLnNldCh2YWx1ZSwgaW1wb3J0cyk7XG5cbiAgICAgICAgICBsZXQgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBsZXQgY3VycmVudEV4cG9ydDtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICAgICAgICBleHBvcnRMaXN0LnNldCh2YWx1ZSwgZXhwb3J0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB3aGVyZVVzZWQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgICAgZXhwb3J0cy5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgeyB3aGVyZVVzZWQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgb2xkRXhwb3J0QWxsLmZvckVhY2goKHZhbHVlKSA9PiB7XG4gICAgICAgIGlmICghbmV3RXhwb3J0QWxsLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBjb25zdCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpbXBvcnRzLmRlbGV0ZShFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5kZWxldGUoZmlsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgbmV3RGVmYXVsdEltcG9ydHMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgaWYgKCFvbGREZWZhdWx0SW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgaW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGltcG9ydHMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGltcG9ydHMuYWRkKElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG4gICAgICAgICAgb2xkSW1wb3J0UGF0aHMuc2V0KHZhbHVlLCBpbXBvcnRzKTtcblxuICAgICAgICAgIGxldCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsdWUpO1xuICAgICAgICAgIGxldCBjdXJyZW50RXhwb3J0O1xuICAgICAgICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQgPSBleHBvcnRzLmdldChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgZXhwb3J0TGlzdC5zZXQodmFsdWUsIGV4cG9ydHMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmFkZChmaWxlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgd2hlcmVVc2VkID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgd2hlcmVVc2VkLmFkZChmaWxlKTtcbiAgICAgICAgICAgIGV4cG9ydHMuc2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgb2xkRGVmYXVsdEltcG9ydHMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgaWYgKCFuZXdEZWZhdWx0SW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgY29uc3QgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaW1wb3J0cy5kZWxldGUoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKTtcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmRlbGV0ZShmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBuZXdOYW1lc3BhY2VJbXBvcnRzLmZvckVhY2goKHZhbHVlKSA9PiB7XG4gICAgICAgIGlmICghb2xkTmFtZXNwYWNlSW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgaW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGltcG9ydHMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGltcG9ydHMuYWRkKElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcbiAgICAgICAgICBvbGRJbXBvcnRQYXRocy5zZXQodmFsdWUsIGltcG9ydHMpO1xuXG4gICAgICAgICAgbGV0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgbGV0IGN1cnJlbnRFeHBvcnQ7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgIGV4cG9ydExpc3Quc2V0KHZhbHVlLCBleHBvcnRzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHdoZXJlVXNlZCA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIHdoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgICBleHBvcnRzLnNldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgb2xkTmFtZXNwYWNlSW1wb3J0cy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBpZiAoIW5ld05hbWVzcGFjZUltcG9ydHMuaGFzKHZhbHVlKSkge1xuICAgICAgICAgIGNvbnN0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpO1xuICAgICAgICAgIGltcG9ydHMuZGVsZXRlKElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuZGVsZXRlKGZpbGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIG5ld0ltcG9ydHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoIW9sZEltcG9ydHMuaGFzKGtleSkpIHtcbiAgICAgICAgICBsZXQgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaW1wb3J0cy5hZGQoa2V5KTtcbiAgICAgICAgICBvbGRJbXBvcnRQYXRocy5zZXQodmFsdWUsIGltcG9ydHMpO1xuXG4gICAgICAgICAgbGV0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgbGV0IGN1cnJlbnRFeHBvcnQ7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICAgICAgICBleHBvcnRMaXN0LnNldCh2YWx1ZSwgZXhwb3J0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB3aGVyZVVzZWQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgICAgZXhwb3J0cy5zZXQoa2V5LCB7IHdoZXJlVXNlZCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBvbGRJbXBvcnRzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKCFuZXdJbXBvcnRzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgY29uc3QgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaW1wb3J0cy5kZWxldGUoa2V5KTtcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KGtleSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmRlbGV0ZShmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgJ1Byb2dyYW06ZXhpdCcobm9kZSkge1xuICAgICAgICB1cGRhdGVFeHBvcnRVc2FnZShub2RlKTtcbiAgICAgICAgdXBkYXRlSW1wb3J0VXNhZ2Uobm9kZSk7XG4gICAgICAgIGNoZWNrRXhwb3J0UHJlc2VuY2Uobm9kZSk7XG4gICAgICB9LFxuICAgICAgRXhwb3J0RGVmYXVsdERlY2xhcmF0aW9uKG5vZGUpIHtcbiAgICAgICAgY2hlY2tVc2FnZShub2RlLCBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIsIGZhbHNlKTtcbiAgICAgIH0sXG4gICAgICBFeHBvcnROYW1lZERlY2xhcmF0aW9uKG5vZGUpIHtcbiAgICAgICAgbm9kZS5zcGVjaWZpZXJzLmZvckVhY2goKHNwZWNpZmllcikgPT4ge1xuICAgICAgICAgIGNoZWNrVXNhZ2Uoc3BlY2lmaWVyLCBzcGVjaWZpZXIuZXhwb3J0ZWQubmFtZSB8fCBzcGVjaWZpZXIuZXhwb3J0ZWQudmFsdWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZvckVhY2hEZWNsYXJhdGlvbklkZW50aWZpZXIobm9kZS5kZWNsYXJhdGlvbiwgKG5hbWUsIGlzVHlwZUV4cG9ydCkgPT4ge1xuICAgICAgICAgIGNoZWNrVXNhZ2Uobm9kZSwgbmFtZSwgaXNUeXBlRXhwb3J0KTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgIH07XG4gIH0sXG59O1xuIl19