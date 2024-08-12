'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();var _resolve = require('eslint-module-utils/resolve');var _resolve2 = _interopRequireDefault(_resolve);
var _semver = require('semver');var _semver2 = _interopRequireDefault(_semver);
var _arrayPrototype = require('array.prototype.flatmap');var _arrayPrototype2 = _interopRequireDefault(_arrayPrototype);

var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}function _toArray(arr) {return Array.isArray(arr) ? arr : Array.from(arr);}

var typescriptPkg = void 0;
try {
  typescriptPkg = require('typescript/package.json'); // eslint-disable-line import/no-extraneous-dependencies
} catch (e) {/**/}

function isPunctuator(node, value) {
  return node.type === 'Punctuator' && node.value === value;
}

// Get the name of the default import of `node`, if any.
function getDefaultImportName(node) {
  var defaultSpecifier = node.specifiers.
  find(function (specifier) {return specifier.type === 'ImportDefaultSpecifier';});
  return defaultSpecifier != null ? defaultSpecifier.local.name : undefined;
}

// Checks whether `node` has a namespace import.
function hasNamespace(node) {
  var specifiers = node.specifiers.
  filter(function (specifier) {return specifier.type === 'ImportNamespaceSpecifier';});
  return specifiers.length > 0;
}

// Checks whether `node` has any non-default specifiers.
function hasSpecifiers(node) {
  var specifiers = node.specifiers.
  filter(function (specifier) {return specifier.type === 'ImportSpecifier';});
  return specifiers.length > 0;
}

// Checks whether `node` has a comment (that ends) on the previous line or on
// the same line as `node` (starts).
function hasCommentBefore(node, sourceCode) {
  return sourceCode.getCommentsBefore(node).
  some(function (comment) {return comment.loc.end.line >= node.loc.start.line - 1;});
}

// Checks whether `node` has a comment (that starts) on the same line as `node`
// (ends).
function hasCommentAfter(node, sourceCode) {
  return sourceCode.getCommentsAfter(node).
  some(function (comment) {return comment.loc.start.line === node.loc.end.line;});
}

// Checks whether `node` has any comments _inside,_ except inside the `{...}`
// part (if any).
function hasCommentInsideNonSpecifiers(node, sourceCode) {
  var tokens = sourceCode.getTokens(node);
  var openBraceIndex = tokens.findIndex(function (token) {return isPunctuator(token, '{');});
  var closeBraceIndex = tokens.findIndex(function (token) {return isPunctuator(token, '}');});
  // Slice away the first token, since we're no looking for comments _before_
  // `node` (only inside). If there's a `{...}` part, look for comments before
  // the `{`, but not before the `}` (hence the `+1`s).
  var someTokens = openBraceIndex >= 0 && closeBraceIndex >= 0 ?
  tokens.slice(1, openBraceIndex + 1).concat(tokens.slice(closeBraceIndex + 1)) :
  tokens.slice(1);
  return someTokens.some(function (token) {return sourceCode.getCommentsBefore(token).length > 0;});
}

// It's not obvious what the user wants to do with comments associated with
// duplicate imports, so skip imports with comments when autofixing.
function hasProblematicComments(node, sourceCode) {
  return (
    hasCommentBefore(node, sourceCode) ||
    hasCommentAfter(node, sourceCode) ||
    hasCommentInsideNonSpecifiers(node, sourceCode));

}

function getFix(first, rest, sourceCode, context) {
  // Sorry ESLint <= 3 users, no autofix for you. Autofixing duplicate imports
  // requires multiple `fixer.whatever()` calls in the `fix`: We both need to
  // update the first one, and remove the rest. Support for multiple
  // `fixer.whatever()` in a single `fix` was added in ESLint 4.1.
  // `sourceCode.getCommentsBefore` was added in 4.0, so that's an easy thing to
  // check for.
  if (typeof sourceCode.getCommentsBefore !== 'function') {
    return undefined;
  }

  // Adjusting the first import might make it multiline, which could break
  // `eslint-disable-next-line` comments and similar, so bail if the first
  // import has comments. Also, if the first import is `import * as ns from
  // './foo'` there's nothing we can do.
  if (hasProblematicComments(first, sourceCode) || hasNamespace(first)) {
    return undefined;
  }

  var defaultImportNames = new Set(
  (0, _arrayPrototype2['default'])([].concat(first, rest || []), function (x) {return getDefaultImportName(x) || [];}));


  // Bail if there are multiple different default import names – it's up to the
  // user to choose which one to keep.
  if (defaultImportNames.size > 1) {
    return undefined;
  }

  // Leave it to the user to handle comments. Also skip `import * as ns from
  // './foo'` imports, since they cannot be merged into another import.
  var restWithoutComments = rest.filter(function (node) {return !hasProblematicComments(node, sourceCode) && !hasNamespace(node);});

  var specifiers = restWithoutComments.
  map(function (node) {
    var tokens = sourceCode.getTokens(node);
    var openBrace = tokens.find(function (token) {return isPunctuator(token, '{');});
    var closeBrace = tokens.find(function (token) {return isPunctuator(token, '}');});

    if (openBrace == null || closeBrace == null) {
      return undefined;
    }

    return {
      importNode: node,
      identifiers: sourceCode.text.slice(openBrace.range[1], closeBrace.range[0]).split(','), // Split the text into separate identifiers (retaining any whitespace before or after)
      isEmpty: !hasSpecifiers(node) };

  }).
  filter(Boolean);

  var unnecessaryImports = restWithoutComments.filter(function (node) {return !hasSpecifiers(node) &&
    !hasNamespace(node) &&
    !specifiers.some(function (specifier) {return specifier.importNode === node;});});


  var shouldAddDefault = getDefaultImportName(first) == null && defaultImportNames.size === 1;
  var shouldAddSpecifiers = specifiers.length > 0;
  var shouldRemoveUnnecessary = unnecessaryImports.length > 0;

  if (!(shouldAddDefault || shouldAddSpecifiers || shouldRemoveUnnecessary)) {
    return undefined;
  }

  return function (fixer) {
    var tokens = sourceCode.getTokens(first);
    var openBrace = tokens.find(function (token) {return isPunctuator(token, '{');});
    var closeBrace = tokens.find(function (token) {return isPunctuator(token, '}');});
    var firstToken = sourceCode.getFirstToken(first);var _defaultImportNames = _slicedToArray(
    defaultImportNames, 1),defaultImportName = _defaultImportNames[0];

    var firstHasTrailingComma = closeBrace != null && isPunctuator(sourceCode.getTokenBefore(closeBrace), ',');
    var firstIsEmpty = !hasSpecifiers(first);
    var firstExistingIdentifiers = firstIsEmpty ?
    new Set() :
    new Set(sourceCode.text.slice(openBrace.range[1], closeBrace.range[0]).
    split(',').
    map(function (x) {return x.trim();}));var _specifiers$reduce =


    specifiers.reduce(
    function (_ref, specifier) {var _ref2 = _slicedToArray(_ref, 3),result = _ref2[0],needsComma = _ref2[1],existingIdentifiers = _ref2[2];
      var isTypeSpecifier = specifier.importNode.importKind === 'type';

      var preferInline = context.options[0] && context.options[0]['prefer-inline'];
      // a user might set prefer-inline but not have a supporting TypeScript version.  Flow does not support inline types so this should fail in that case as well.
      if (preferInline && (!typescriptPkg || !_semver2['default'].satisfies(typescriptPkg.version, '>= 4.5'))) {
        throw new Error('Your version of TypeScript does not support inline type imports.');
      }

      // Add *only* the new identifiers that don't already exist, and track any new identifiers so we don't add them again in the next loop
      var _specifier$identifier = specifier.identifiers.reduce(function (_ref3, cur) {var _ref4 = _slicedToArray(_ref3, 2),text = _ref4[0],set = _ref4[1];
        var trimmed = cur.trim(); // Trim whitespace before/after to compare to our set of existing identifiers
        var curWithType = trimmed.length > 0 && preferInline && isTypeSpecifier ? 'type ' + String(cur) : cur;
        if (existingIdentifiers.has(trimmed)) {
          return [text, set];
        }
        return [text.length > 0 ? String(text) + ',' + String(curWithType) : curWithType, set.add(trimmed)];
      }, ['', existingIdentifiers]),_specifier$identifier2 = _slicedToArray(_specifier$identifier, 2),specifierText = _specifier$identifier2[0],updatedExistingIdentifiers = _specifier$identifier2[1];

      return [
      needsComma && !specifier.isEmpty && specifierText.length > 0 ? String(
      result) + ',' + String(specifierText) : '' + String(
      result) + String(specifierText),
      specifier.isEmpty ? needsComma : true,
      updatedExistingIdentifiers];

    },
    ['', !firstHasTrailingComma && !firstIsEmpty, firstExistingIdentifiers]),_specifiers$reduce2 = _slicedToArray(_specifiers$reduce, 1),specifiersText = _specifiers$reduce2[0];


    var fixes = [];

    if (shouldAddDefault && openBrace == null && shouldAddSpecifiers) {
      // `import './foo'` → `import def, {...} from './foo'`
      fixes.push(
      fixer.insertTextAfter(firstToken, ' ' + String(defaultImportName) + ', {' + String(specifiersText) + '} from'));

    } else if (shouldAddDefault && openBrace == null && !shouldAddSpecifiers) {
      // `import './foo'` → `import def from './foo'`
      fixes.push(fixer.insertTextAfter(firstToken, ' ' + String(defaultImportName) + ' from'));
    } else if (shouldAddDefault && openBrace != null && closeBrace != null) {
      // `import {...} from './foo'` → `import def, {...} from './foo'`
      fixes.push(fixer.insertTextAfter(firstToken, ' ' + String(defaultImportName) + ','));
      if (shouldAddSpecifiers) {
        // `import def, {...} from './foo'` → `import def, {..., ...} from './foo'`
        fixes.push(fixer.insertTextBefore(closeBrace, specifiersText));
      }
    } else if (!shouldAddDefault && openBrace == null && shouldAddSpecifiers) {
      if (first.specifiers.length === 0) {
        // `import './foo'` → `import {...} from './foo'`
        fixes.push(fixer.insertTextAfter(firstToken, ' {' + String(specifiersText) + '} from'));
      } else {
        // `import def from './foo'` → `import def, {...} from './foo'`
        fixes.push(fixer.insertTextAfter(first.specifiers[0], ', {' + String(specifiersText) + '}'));
      }
    } else if (!shouldAddDefault && openBrace != null && closeBrace != null) {
      // `import {...} './foo'` → `import {..., ...} from './foo'`
      fixes.push(fixer.insertTextBefore(closeBrace, specifiersText));
    }

    // Remove imports whose specifiers have been moved into the first import.
    var _iteratorNormalCompletion = true;var _didIteratorError = false;var _iteratorError = undefined;try {for (var _iterator = specifiers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {var specifier = _step.value;
        var importNode = specifier.importNode;
        fixes.push(fixer.remove(importNode));

        var charAfterImportRange = [importNode.range[1], importNode.range[1] + 1];
        var charAfterImport = sourceCode.text.substring(charAfterImportRange[0], charAfterImportRange[1]);
        if (charAfterImport === '\n') {
          fixes.push(fixer.removeRange(charAfterImportRange));
        }
      }

      // Remove imports whose default import has been moved to the first import,
      // and side-effect-only imports that are unnecessary due to the first
      // import.
    } catch (err) {_didIteratorError = true;_iteratorError = err;} finally {try {if (!_iteratorNormalCompletion && _iterator['return']) {_iterator['return']();}} finally {if (_didIteratorError) {throw _iteratorError;}}}var _iteratorNormalCompletion2 = true;var _didIteratorError2 = false;var _iteratorError2 = undefined;try {for (var _iterator2 = unnecessaryImports[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {var node = _step2.value;
        fixes.push(fixer.remove(node));

        var charAfterImportRange = [node.range[1], node.range[1] + 1];
        var charAfterImport = sourceCode.text.substring(charAfterImportRange[0], charAfterImportRange[1]);
        if (charAfterImport === '\n') {
          fixes.push(fixer.removeRange(charAfterImportRange));
        }
      }} catch (err) {_didIteratorError2 = true;_iteratorError2 = err;} finally {try {if (!_iteratorNormalCompletion2 && _iterator2['return']) {_iterator2['return']();}} finally {if (_didIteratorError2) {throw _iteratorError2;}}}

    return fixes;
  };
}

function checkImports(imported, context) {var _iteratorNormalCompletion3 = true;var _didIteratorError3 = false;var _iteratorError3 = undefined;try {
    for (var _iterator3 = imported.entries()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {var _ref5 = _step3.value;var _ref6 = _slicedToArray(_ref5, 2);var _module = _ref6[0];var nodes = _ref6[1];
      if (nodes.length > 1) {
        var message = '\'' + String(_module) + '\' imported multiple times.';var _nodes = _toArray(
        nodes),first = _nodes[0],rest = _nodes.slice(1);
        var sourceCode = context.getSourceCode();
        var fix = getFix(first, rest, sourceCode, context);

        context.report({
          node: first.source,
          message: message,
          fix: fix // Attach the autofix (if any) to the first import.
        });var _iteratorNormalCompletion4 = true;var _didIteratorError4 = false;var _iteratorError4 = undefined;try {

          for (var _iterator4 = rest[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {var node = _step4.value;
            context.report({
              node: node.source,
              message: message });

          }} catch (err) {_didIteratorError4 = true;_iteratorError4 = err;} finally {try {if (!_iteratorNormalCompletion4 && _iterator4['return']) {_iterator4['return']();}} finally {if (_didIteratorError4) {throw _iteratorError4;}}}
      }
    }} catch (err) {_didIteratorError3 = true;_iteratorError3 = err;} finally {try {if (!_iteratorNormalCompletion3 && _iterator3['return']) {_iterator3['return']();}} finally {if (_didIteratorError3) {throw _iteratorError3;}}}
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      category: 'Style guide',
      description: 'Forbid repeated import of the same module in multiple places.',
      url: (0, _docsUrl2['default'])('no-duplicates') },

    fixable: 'code',
    schema: [
    {
      type: 'object',
      properties: {
        considerQueryString: {
          type: 'boolean' },

        'prefer-inline': {
          type: 'boolean' } },


      additionalProperties: false }] },




  create: function () {function create(context) {
      // Prepare the resolver from options.
      var considerQueryStringOption = context.options[0] &&
      context.options[0].considerQueryString;
      var defaultResolver = function () {function defaultResolver(sourcePath) {return (0, _resolve2['default'])(sourcePath, context) || sourcePath;}return defaultResolver;}();
      var resolver = considerQueryStringOption ? function (sourcePath) {
        var parts = sourcePath.match(/^([^?]*)\?(.*)$/);
        if (!parts) {
          return defaultResolver(sourcePath);
        }
        return String(defaultResolver(parts[1])) + '?' + String(parts[2]);
      } : defaultResolver;

      var moduleMaps = new Map();

      function getImportMap(n) {
        if (!moduleMaps.has(n.parent)) {
          moduleMaps.set(n.parent, {
            imported: new Map(),
            nsImported: new Map(),
            defaultTypesImported: new Map(),
            namedTypesImported: new Map() });

        }
        var map = moduleMaps.get(n.parent);
        var preferInline = context.options[0] && context.options[0]['prefer-inline'];
        if (!preferInline && n.importKind === 'type') {
          return n.specifiers.length > 0 && n.specifiers[0].type === 'ImportDefaultSpecifier' ? map.defaultTypesImported : map.namedTypesImported;
        }
        if (!preferInline && n.specifiers.some(function (spec) {return spec.importKind === 'type';})) {
          return map.namedTypesImported;
        }

        return hasNamespace(n) ? map.nsImported : map.imported;
      }

      return {
        ImportDeclaration: function () {function ImportDeclaration(n) {
            // resolved path will cover aliased duplicates
            var resolvedPath = resolver(n.source.value);
            var importMap = getImportMap(n);

            if (importMap.has(resolvedPath)) {
              importMap.get(resolvedPath).push(n);
            } else {
              importMap.set(resolvedPath, [n]);
            }
          }return ImportDeclaration;}(),

        'Program:exit': function () {function ProgramExit() {var _iteratorNormalCompletion5 = true;var _didIteratorError5 = false;var _iteratorError5 = undefined;try {
              for (var _iterator5 = moduleMaps.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {var map = _step5.value;
                checkImports(map.imported, context);
                checkImports(map.nsImported, context);
                checkImports(map.defaultTypesImported, context);
                checkImports(map.namedTypesImported, context);
              }} catch (err) {_didIteratorError5 = true;_iteratorError5 = err;} finally {try {if (!_iteratorNormalCompletion5 && _iterator5['return']) {_iterator5['return']();}} finally {if (_didIteratorError5) {throw _iteratorError5;}}}
          }return ProgramExit;}() };

    }return create;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby1kdXBsaWNhdGVzLmpzIl0sIm5hbWVzIjpbInR5cGVzY3JpcHRQa2ciLCJyZXF1aXJlIiwiZSIsImlzUHVuY3R1YXRvciIsIm5vZGUiLCJ2YWx1ZSIsInR5cGUiLCJnZXREZWZhdWx0SW1wb3J0TmFtZSIsImRlZmF1bHRTcGVjaWZpZXIiLCJzcGVjaWZpZXJzIiwiZmluZCIsInNwZWNpZmllciIsImxvY2FsIiwibmFtZSIsInVuZGVmaW5lZCIsImhhc05hbWVzcGFjZSIsImZpbHRlciIsImxlbmd0aCIsImhhc1NwZWNpZmllcnMiLCJoYXNDb21tZW50QmVmb3JlIiwic291cmNlQ29kZSIsImdldENvbW1lbnRzQmVmb3JlIiwic29tZSIsImNvbW1lbnQiLCJsb2MiLCJlbmQiLCJsaW5lIiwic3RhcnQiLCJoYXNDb21tZW50QWZ0ZXIiLCJnZXRDb21tZW50c0FmdGVyIiwiaGFzQ29tbWVudEluc2lkZU5vblNwZWNpZmllcnMiLCJ0b2tlbnMiLCJnZXRUb2tlbnMiLCJvcGVuQnJhY2VJbmRleCIsImZpbmRJbmRleCIsInRva2VuIiwiY2xvc2VCcmFjZUluZGV4Iiwic29tZVRva2VucyIsInNsaWNlIiwiY29uY2F0IiwiaGFzUHJvYmxlbWF0aWNDb21tZW50cyIsImdldEZpeCIsImZpcnN0IiwicmVzdCIsImNvbnRleHQiLCJkZWZhdWx0SW1wb3J0TmFtZXMiLCJTZXQiLCJ4Iiwic2l6ZSIsInJlc3RXaXRob3V0Q29tbWVudHMiLCJtYXAiLCJvcGVuQnJhY2UiLCJjbG9zZUJyYWNlIiwiaW1wb3J0Tm9kZSIsImlkZW50aWZpZXJzIiwidGV4dCIsInJhbmdlIiwic3BsaXQiLCJpc0VtcHR5IiwiQm9vbGVhbiIsInVubmVjZXNzYXJ5SW1wb3J0cyIsInNob3VsZEFkZERlZmF1bHQiLCJzaG91bGRBZGRTcGVjaWZpZXJzIiwic2hvdWxkUmVtb3ZlVW5uZWNlc3NhcnkiLCJmaXhlciIsImZpcnN0VG9rZW4iLCJnZXRGaXJzdFRva2VuIiwiZGVmYXVsdEltcG9ydE5hbWUiLCJmaXJzdEhhc1RyYWlsaW5nQ29tbWEiLCJnZXRUb2tlbkJlZm9yZSIsImZpcnN0SXNFbXB0eSIsImZpcnN0RXhpc3RpbmdJZGVudGlmaWVycyIsInRyaW0iLCJyZWR1Y2UiLCJyZXN1bHQiLCJuZWVkc0NvbW1hIiwiZXhpc3RpbmdJZGVudGlmaWVycyIsImlzVHlwZVNwZWNpZmllciIsImltcG9ydEtpbmQiLCJwcmVmZXJJbmxpbmUiLCJvcHRpb25zIiwic2VtdmVyIiwic2F0aXNmaWVzIiwidmVyc2lvbiIsIkVycm9yIiwiY3VyIiwic2V0IiwidHJpbW1lZCIsImN1cldpdGhUeXBlIiwiaGFzIiwiYWRkIiwic3BlY2lmaWVyVGV4dCIsInVwZGF0ZWRFeGlzdGluZ0lkZW50aWZpZXJzIiwic3BlY2lmaWVyc1RleHQiLCJmaXhlcyIsInB1c2giLCJpbnNlcnRUZXh0QWZ0ZXIiLCJpbnNlcnRUZXh0QmVmb3JlIiwicmVtb3ZlIiwiY2hhckFmdGVySW1wb3J0UmFuZ2UiLCJjaGFyQWZ0ZXJJbXBvcnQiLCJzdWJzdHJpbmciLCJyZW1vdmVSYW5nZSIsImNoZWNrSW1wb3J0cyIsImltcG9ydGVkIiwiZW50cmllcyIsIm1vZHVsZSIsIm5vZGVzIiwibWVzc2FnZSIsImdldFNvdXJjZUNvZGUiLCJmaXgiLCJyZXBvcnQiLCJzb3VyY2UiLCJleHBvcnRzIiwibWV0YSIsImRvY3MiLCJjYXRlZ29yeSIsImRlc2NyaXB0aW9uIiwidXJsIiwiZml4YWJsZSIsInNjaGVtYSIsInByb3BlcnRpZXMiLCJjb25zaWRlclF1ZXJ5U3RyaW5nIiwiYWRkaXRpb25hbFByb3BlcnRpZXMiLCJjcmVhdGUiLCJjb25zaWRlclF1ZXJ5U3RyaW5nT3B0aW9uIiwiZGVmYXVsdFJlc29sdmVyIiwic291cmNlUGF0aCIsInJlc29sdmVyIiwicGFydHMiLCJtYXRjaCIsIm1vZHVsZU1hcHMiLCJNYXAiLCJnZXRJbXBvcnRNYXAiLCJuIiwicGFyZW50IiwibnNJbXBvcnRlZCIsImRlZmF1bHRUeXBlc0ltcG9ydGVkIiwibmFtZWRUeXBlc0ltcG9ydGVkIiwiZ2V0Iiwic3BlYyIsIkltcG9ydERlY2xhcmF0aW9uIiwicmVzb2x2ZWRQYXRoIiwiaW1wb3J0TWFwIiwidmFsdWVzIl0sIm1hcHBpbmdzIjoicW9CQUFBLHNEO0FBQ0EsZ0M7QUFDQSx5RDs7QUFFQSxxQzs7QUFFQSxJQUFJQSxzQkFBSjtBQUNBLElBQUk7QUFDRkEsa0JBQWdCQyxRQUFRLHlCQUFSLENBQWhCLENBREUsQ0FDa0Q7QUFDckQsQ0FGRCxDQUVFLE9BQU9DLENBQVAsRUFBVSxDQUFFLElBQU07O0FBRXBCLFNBQVNDLFlBQVQsQ0FBc0JDLElBQXRCLEVBQTRCQyxLQUE1QixFQUFtQztBQUNqQyxTQUFPRCxLQUFLRSxJQUFMLEtBQWMsWUFBZCxJQUE4QkYsS0FBS0MsS0FBTCxLQUFlQSxLQUFwRDtBQUNEOztBQUVEO0FBQ0EsU0FBU0Usb0JBQVQsQ0FBOEJILElBQTlCLEVBQW9DO0FBQ2xDLE1BQU1JLG1CQUFtQkosS0FBS0ssVUFBTDtBQUN0QkMsTUFEc0IsQ0FDakIsVUFBQ0MsU0FBRCxVQUFlQSxVQUFVTCxJQUFWLEtBQW1CLHdCQUFsQyxFQURpQixDQUF6QjtBQUVBLFNBQU9FLG9CQUFvQixJQUFwQixHQUEyQkEsaUJBQWlCSSxLQUFqQixDQUF1QkMsSUFBbEQsR0FBeURDLFNBQWhFO0FBQ0Q7O0FBRUQ7QUFDQSxTQUFTQyxZQUFULENBQXNCWCxJQUF0QixFQUE0QjtBQUMxQixNQUFNSyxhQUFhTCxLQUFLSyxVQUFMO0FBQ2hCTyxRQURnQixDQUNULFVBQUNMLFNBQUQsVUFBZUEsVUFBVUwsSUFBVixLQUFtQiwwQkFBbEMsRUFEUyxDQUFuQjtBQUVBLFNBQU9HLFdBQVdRLE1BQVgsR0FBb0IsQ0FBM0I7QUFDRDs7QUFFRDtBQUNBLFNBQVNDLGFBQVQsQ0FBdUJkLElBQXZCLEVBQTZCO0FBQzNCLE1BQU1LLGFBQWFMLEtBQUtLLFVBQUw7QUFDaEJPLFFBRGdCLENBQ1QsVUFBQ0wsU0FBRCxVQUFlQSxVQUFVTCxJQUFWLEtBQW1C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aWxlIjoibm8tZHVwbGljYXRlcy5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCByZXNvbHZlIGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvcmVzb2x2ZSc7XG5pbXBvcnQgc2VtdmVyIGZyb20gJ3NlbXZlcic7XG5pbXBvcnQgZmxhdE1hcCBmcm9tICdhcnJheS5wcm90b3R5cGUuZmxhdG1hcCc7XG5cbmltcG9ydCBkb2NzVXJsIGZyb20gJy4uL2RvY3NVcmwnO1xuXG5sZXQgdHlwZXNjcmlwdFBrZztcbnRyeSB7XG4gIHR5cGVzY3JpcHRQa2cgPSByZXF1aXJlKCd0eXBlc2NyaXB0L3BhY2thZ2UuanNvbicpOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGltcG9ydC9uby1leHRyYW5lb3VzLWRlcGVuZGVuY2llc1xufSBjYXRjaCAoZSkgeyAvKiovIH1cblxuZnVuY3Rpb24gaXNQdW5jdHVhdG9yKG5vZGUsIHZhbHVlKSB7XG4gIHJldHVybiBub2RlLnR5cGUgPT09ICdQdW5jdHVhdG9yJyAmJiBub2RlLnZhbHVlID09PSB2YWx1ZTtcbn1cblxuLy8gR2V0IHRoZSBuYW1lIG9mIHRoZSBkZWZhdWx0IGltcG9ydCBvZiBgbm9kZWAsIGlmIGFueS5cbmZ1bmN0aW9uIGdldERlZmF1bHRJbXBvcnROYW1lKG5vZGUpIHtcbiAgY29uc3QgZGVmYXVsdFNwZWNpZmllciA9IG5vZGUuc3BlY2lmaWVyc1xuICAgIC5maW5kKChzcGVjaWZpZXIpID0+IHNwZWNpZmllci50eXBlID09PSAnSW1wb3J0RGVmYXVsdFNwZWNpZmllcicpO1xuICByZXR1cm4gZGVmYXVsdFNwZWNpZmllciAhPSBudWxsID8gZGVmYXVsdFNwZWNpZmllci5sb2NhbC5uYW1lIDogdW5kZWZpbmVkO1xufVxuXG4vLyBDaGVja3Mgd2hldGhlciBgbm9kZWAgaGFzIGEgbmFtZXNwYWNlIGltcG9ydC5cbmZ1bmN0aW9uIGhhc05hbWVzcGFjZShub2RlKSB7XG4gIGNvbnN0IHNwZWNpZmllcnMgPSBub2RlLnNwZWNpZmllcnNcbiAgICAuZmlsdGVyKChzcGVjaWZpZXIpID0+IHNwZWNpZmllci50eXBlID09PSAnSW1wb3J0TmFtZXNwYWNlU3BlY2lmaWVyJyk7XG4gIHJldHVybiBzcGVjaWZpZXJzLmxlbmd0aCA+IDA7XG59XG5cbi8vIENoZWNrcyB3aGV0aGVyIGBub2RlYCBoYXMgYW55IG5vbi1kZWZhdWx0IHNwZWNpZmllcnMuXG5mdW5jdGlvbiBoYXNTcGVjaWZpZXJzKG5vZGUpIHtcbiAgY29uc3Qgc3BlY2lmaWVycyA9IG5vZGUuc3BlY2lmaWVyc1xuICAgIC5maWx0ZXIoKHNwZWNpZmllcikgPT4gc3BlY2lmaWVyLnR5cGUgPT09ICdJbXBvcnRTcGVjaWZpZXInKTtcbiAgcmV0dXJuIHNwZWNpZmllcnMubGVuZ3RoID4gMDtcbn1cblxuLy8gQ2hlY2tzIHdoZXRoZXIgYG5vZGVgIGhhcyBhIGNvbW1lbnQgKHRoYXQgZW5kcykgb24gdGhlIHByZXZpb3VzIGxpbmUgb3Igb25cbi8vIHRoZSBzYW1lIGxpbmUgYXMgYG5vZGVgIChzdGFydHMpLlxuZnVuY3Rpb24gaGFzQ29tbWVudEJlZm9yZShub2RlLCBzb3VyY2VDb2RlKSB7XG4gIHJldHVybiBzb3VyY2VDb2RlLmdldENvbW1lbnRzQmVmb3JlKG5vZGUpXG4gICAgLnNvbWUoKGNvbW1lbnQpID0+IGNvbW1lbnQubG9jLmVuZC5saW5lID49IG5vZGUubG9jLnN0YXJ0LmxpbmUgLSAxKTtcbn1cblxuLy8gQ2hlY2tzIHdoZXRoZXIgYG5vZGVgIGhhcyBhIGNvbW1lbnQgKHRoYXQgc3RhcnRzKSBvbiB0aGUgc2FtZSBsaW5lIGFzIGBub2RlYFxuLy8gKGVuZHMpLlxuZnVuY3Rpb24gaGFzQ29tbWVudEFmdGVyKG5vZGUsIHNvdXJjZUNvZGUpIHtcbiAgcmV0dXJuIHNvdXJjZUNvZGUuZ2V0Q29tbWVudHNBZnRlcihub2RlKVxuICAgIC5zb21lKChjb21tZW50KSA9PiBjb21tZW50LmxvYy5zdGFydC5saW5lID09PSBub2RlLmxvYy5lbmQubGluZSk7XG59XG5cbi8vIENoZWNrcyB3aGV0aGVyIGBub2RlYCBoYXMgYW55IGNvbW1lbnRzIF9pbnNpZGUsXyBleGNlcHQgaW5zaWRlIHRoZSBgey4uLn1gXG4vLyBwYXJ0IChpZiBhbnkpLlxuZnVuY3Rpb24gaGFzQ29tbWVudEluc2lkZU5vblNwZWNpZmllcnMobm9kZSwgc291cmNlQ29kZSkge1xuICBjb25zdCB0b2tlbnMgPSBzb3VyY2VDb2RlLmdldFRva2Vucyhub2RlKTtcbiAgY29uc3Qgb3BlbkJyYWNlSW5kZXggPSB0b2tlbnMuZmluZEluZGV4KCh0b2tlbikgPT4gaXNQdW5jdHVhdG9yKHRva2VuLCAneycpKTtcbiAgY29uc3QgY2xvc2VCcmFjZUluZGV4ID0gdG9rZW5zLmZpbmRJbmRleCgodG9rZW4pID0+IGlzUHVuY3R1YXRvcih0b2tlbiwgJ30nKSk7XG4gIC8vIFNsaWNlIGF3YXkgdGhlIGZpcnN0IHRva2VuLCBzaW5jZSB3ZSdyZSBubyBsb29raW5nIGZvciBjb21tZW50cyBfYmVmb3JlX1xuICAvLyBgbm9kZWAgKG9ubHkgaW5zaWRlKS4gSWYgdGhlcmUncyBhIGB7Li4ufWAgcGFydCwgbG9vayBmb3IgY29tbWVudHMgYmVmb3JlXG4gIC8vIHRoZSBge2AsIGJ1dCBub3QgYmVmb3JlIHRoZSBgfWAgKGhlbmNlIHRoZSBgKzFgcykuXG4gIGNvbnN0IHNvbWVUb2tlbnMgPSBvcGVuQnJhY2VJbmRleCA+PSAwICYmIGNsb3NlQnJhY2VJbmRleCA+PSAwXG4gICAgPyB0b2tlbnMuc2xpY2UoMSwgb3BlbkJyYWNlSW5kZXggKyAxKS5jb25jYXQodG9rZW5zLnNsaWNlKGNsb3NlQnJhY2VJbmRleCArIDEpKVxuICAgIDogdG9rZW5zLnNsaWNlKDEpO1xuICByZXR1cm4gc29tZVRva2Vucy5zb21lKCh0b2tlbikgPT4gc291cmNlQ29kZS5nZXRDb21tZW50c0JlZm9yZSh0b2tlbikubGVuZ3RoID4gMCk7XG59XG5cbi8vIEl0J3Mgbm90IG9idmlvdXMgd2hhdCB0aGUgdXNlciB3YW50cyB0byBkbyB3aXRoIGNvbW1lbnRzIGFzc29jaWF0ZWQgd2l0aFxuLy8gZHVwbGljYXRlIGltcG9ydHMsIHNvIHNraXAgaW1wb3J0cyB3aXRoIGNvbW1lbnRzIHdoZW4gYXV0b2ZpeGluZy5cbmZ1bmN0aW9uIGhhc1Byb2JsZW1hdGljQ29tbWVudHMobm9kZSwgc291cmNlQ29kZSkge1xuICByZXR1cm4gKFxuICAgIGhhc0NvbW1lbnRCZWZvcmUobm9kZSwgc291cmNlQ29kZSlcbiAgICB8fCBoYXNDb21tZW50QWZ0ZXIobm9kZSwgc291cmNlQ29kZSlcbiAgICB8fCBoYXNDb21tZW50SW5zaWRlTm9uU3BlY2lmaWVycyhub2RlLCBzb3VyY2VDb2RlKVxuICApO1xufVxuXG5mdW5jdGlvbiBnZXRGaXgoZmlyc3QsIHJlc3QsIHNvdXJjZUNvZGUsIGNvbnRleHQpIHtcbiAgLy8gU29ycnkgRVNMaW50IDw9IDMgdXNlcnMsIG5vIGF1dG9maXggZm9yIHlvdS4gQXV0b2ZpeGluZyBkdXBsaWNhdGUgaW1wb3J0c1xuICAvLyByZXF1aXJlcyBtdWx0aXBsZSBgZml4ZXIud2hhdGV2ZXIoKWAgY2FsbHMgaW4gdGhlIGBmaXhgOiBXZSBib3RoIG5lZWQgdG9cbiAgLy8gdXBkYXRlIHRoZSBmaXJzdCBvbmUsIGFuZCByZW1vdmUgdGhlIHJlc3QuIFN1cHBvcnQgZm9yIG11bHRpcGxlXG4gIC8vIGBmaXhlci53aGF0ZXZlcigpYCBpbiBhIHNpbmdsZSBgZml4YCB3YXMgYWRkZWQgaW4gRVNMaW50IDQuMS5cbiAgLy8gYHNvdXJjZUNvZGUuZ2V0Q29tbWVudHNCZWZvcmVgIHdhcyBhZGRlZCBpbiA0LjAsIHNvIHRoYXQncyBhbiBlYXN5IHRoaW5nIHRvXG4gIC8vIGNoZWNrIGZvci5cbiAgaWYgKHR5cGVvZiBzb3VyY2VDb2RlLmdldENvbW1lbnRzQmVmb3JlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIEFkanVzdGluZyB0aGUgZmlyc3QgaW1wb3J0IG1pZ2h0IG1ha2UgaXQgbXVsdGlsaW5lLCB3aGljaCBjb3VsZCBicmVha1xuICAvLyBgZXNsaW50LWRpc2FibGUtbmV4dC1saW5lYCBjb21tZW50cyBhbmQgc2ltaWxhciwgc28gYmFpbCBpZiB0aGUgZmlyc3RcbiAgLy8gaW1wb3J0IGhhcyBjb21tZW50cy4gQWxzbywgaWYgdGhlIGZpcnN0IGltcG9ydCBpcyBgaW1wb3J0ICogYXMgbnMgZnJvbVxuICAvLyAnLi9mb28nYCB0aGVyZSdzIG5vdGhpbmcgd2UgY2FuIGRvLlxuICBpZiAoaGFzUHJvYmxlbWF0aWNDb21tZW50cyhmaXJzdCwgc291cmNlQ29kZSkgfHwgaGFzTmFtZXNwYWNlKGZpcnN0KSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICBjb25zdCBkZWZhdWx0SW1wb3J0TmFtZXMgPSBuZXcgU2V0KFxuICAgIGZsYXRNYXAoW10uY29uY2F0KGZpcnN0LCByZXN0IHx8IFtdKSwgKHgpID0+IGdldERlZmF1bHRJbXBvcnROYW1lKHgpIHx8IFtdKSxcbiAgKTtcblxuICAvLyBCYWlsIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBkaWZmZXJlbnQgZGVmYXVsdCBpbXBvcnQgbmFtZXMg4oCTIGl0J3MgdXAgdG8gdGhlXG4gIC8vIHVzZXIgdG8gY2hvb3NlIHdoaWNoIG9uZSB0byBrZWVwLlxuICBpZiAoZGVmYXVsdEltcG9ydE5hbWVzLnNpemUgPiAxKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIExlYXZlIGl0IHRvIHRoZSB1c2VyIHRvIGhhbmRsZSBjb21tZW50cy4gQWxzbyBza2lwIGBpbXBvcnQgKiBhcyBucyBmcm9tXG4gIC8vICcuL2ZvbydgIGltcG9ydHMsIHNpbmNlIHRoZXkgY2Fubm90IGJlIG1lcmdlZCBpbnRvIGFub3RoZXIgaW1wb3J0LlxuICBjb25zdCByZXN0V2l0aG91dENvbW1lbnRzID0gcmVzdC5maWx0ZXIoKG5vZGUpID0+ICFoYXNQcm9ibGVtYXRpY0NvbW1lbnRzKG5vZGUsIHNvdXJjZUNvZGUpICYmICFoYXNOYW1lc3BhY2Uobm9kZSkpO1xuXG4gIGNvbnN0IHNwZWNpZmllcnMgPSByZXN0V2l0aG91dENvbW1lbnRzXG4gICAgLm1hcCgobm9kZSkgPT4ge1xuICAgICAgY29uc3QgdG9rZW5zID0gc291cmNlQ29kZS5nZXRUb2tlbnMobm9kZSk7XG4gICAgICBjb25zdCBvcGVuQnJhY2UgPSB0b2tlbnMuZmluZCgodG9rZW4pID0+IGlzUHVuY3R1YXRvcih0b2tlbiwgJ3snKSk7XG4gICAgICBjb25zdCBjbG9zZUJyYWNlID0gdG9rZW5zLmZpbmQoKHRva2VuKSA9PiBpc1B1bmN0dWF0b3IodG9rZW4sICd9JykpO1xuXG4gICAgICBpZiAob3BlbkJyYWNlID09IG51bGwgfHwgY2xvc2VCcmFjZSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGltcG9ydE5vZGU6IG5vZGUsXG4gICAgICAgIGlkZW50aWZpZXJzOiBzb3VyY2VDb2RlLnRleHQuc2xpY2Uob3BlbkJyYWNlLnJhbmdlWzFdLCBjbG9zZUJyYWNlLnJhbmdlWzBdKS5zcGxpdCgnLCcpLCAvLyBTcGxpdCB0aGUgdGV4dCBpbnRvIHNlcGFyYXRlIGlkZW50aWZpZXJzIChyZXRhaW5pbmcgYW55IHdoaXRlc3BhY2UgYmVmb3JlIG9yIGFmdGVyKVxuICAgICAgICBpc0VtcHR5OiAhaGFzU3BlY2lmaWVycyhub2RlKSxcbiAgICAgIH07XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuXG4gIGNvbnN0IHVubmVjZXNzYXJ5SW1wb3J0cyA9IHJlc3RXaXRob3V0Q29tbWVudHMuZmlsdGVyKChub2RlKSA9PiAhaGFzU3BlY2lmaWVycyhub2RlKVxuICAgICYmICFoYXNOYW1lc3BhY2Uobm9kZSlcbiAgICAmJiAhc3BlY2lmaWVycy5zb21lKChzcGVjaWZpZXIpID0+IHNwZWNpZmllci5pbXBvcnROb2RlID09PSBub2RlKSxcbiAgKTtcblxuICBjb25zdCBzaG91bGRBZGREZWZhdWx0ID0gZ2V0RGVmYXVsdEltcG9ydE5hbWUoZmlyc3QpID09IG51bGwgJiYgZGVmYXVsdEltcG9ydE5hbWVzLnNpemUgPT09IDE7XG4gIGNvbnN0IHNob3VsZEFkZFNwZWNpZmllcnMgPSBzcGVjaWZpZXJzLmxlbmd0aCA+IDA7XG4gIGNvbnN0IHNob3VsZFJlbW92ZVVubmVjZXNzYXJ5ID0gdW5uZWNlc3NhcnlJbXBvcnRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCEoc2hvdWxkQWRkRGVmYXVsdCB8fCBzaG91bGRBZGRTcGVjaWZpZXJzIHx8IHNob3VsZFJlbW92ZVVubmVjZXNzYXJ5KSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4gKGZpeGVyKSA9PiB7XG4gICAgY29uc3QgdG9rZW5zID0gc291cmNlQ29kZS5nZXRUb2tlbnMoZmlyc3QpO1xuICAgIGNvbnN0IG9wZW5CcmFjZSA9IHRva2Vucy5maW5kKCh0b2tlbikgPT4gaXNQdW5jdHVhdG9yKHRva2VuLCAneycpKTtcbiAgICBjb25zdCBjbG9zZUJyYWNlID0gdG9rZW5zLmZpbmQoKHRva2VuKSA9PiBpc1B1bmN0dWF0b3IodG9rZW4sICd9JykpO1xuICAgIGNvbnN0IGZpcnN0VG9rZW4gPSBzb3VyY2VDb2RlLmdldEZpcnN0VG9rZW4oZmlyc3QpO1xuICAgIGNvbnN0IFtkZWZhdWx0SW1wb3J0TmFtZV0gPSBkZWZhdWx0SW1wb3J0TmFtZXM7XG5cbiAgICBjb25zdCBmaXJzdEhhc1RyYWlsaW5nQ29tbWEgPSBjbG9zZUJyYWNlICE9IG51bGwgJiYgaXNQdW5jdHVhdG9yKHNvdXJjZUNvZGUuZ2V0VG9rZW5CZWZvcmUoY2xvc2VCcmFjZSksICcsJyk7XG4gICAgY29uc3QgZmlyc3RJc0VtcHR5ID0gIWhhc1NwZWNpZmllcnMoZmlyc3QpO1xuICAgIGNvbnN0IGZpcnN0RXhpc3RpbmdJZGVudGlmaWVycyA9IGZpcnN0SXNFbXB0eVxuICAgICAgPyBuZXcgU2V0KClcbiAgICAgIDogbmV3IFNldChzb3VyY2VDb2RlLnRleHQuc2xpY2Uob3BlbkJyYWNlLnJhbmdlWzFdLCBjbG9zZUJyYWNlLnJhbmdlWzBdKVxuICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAubWFwKCh4KSA9PiB4LnRyaW0oKSksXG4gICAgICApO1xuXG4gICAgY29uc3QgW3NwZWNpZmllcnNUZXh0XSA9IHNwZWNpZmllcnMucmVkdWNlKFxuICAgICAgKFtyZXN1bHQsIG5lZWRzQ29tbWEsIGV4aXN0aW5nSWRlbnRpZmllcnNdLCBzcGVjaWZpZXIpID0+IHtcbiAgICAgICAgY29uc3QgaXNUeXBlU3BlY2lmaWVyID0gc3BlY2lmaWVyLmltcG9ydE5vZGUuaW1wb3J0S2luZCA9PT0gJ3R5cGUnO1xuXG4gICAgICAgIGNvbnN0IHByZWZlcklubGluZSA9IGNvbnRleHQub3B0aW9uc1swXSAmJiBjb250ZXh0Lm9wdGlvbnNbMF1bJ3ByZWZlci1pbmxpbmUnXTtcbiAgICAgICAgLy8gYSB1c2VyIG1pZ2h0IHNldCBwcmVmZXItaW5saW5lIGJ1dCBub3QgaGF2ZSBhIHN1cHBvcnRpbmcgVHlwZVNjcmlwdCB2ZXJzaW9uLiAgRmxvdyBkb2VzIG5vdCBzdXBwb3J0IGlubGluZSB0eXBlcyBzbyB0aGlzIHNob3VsZCBmYWlsIGluIHRoYXQgY2FzZSBhcyB3ZWxsLlxuICAgICAgICBpZiAocHJlZmVySW5saW5lICYmICghdHlwZXNjcmlwdFBrZyB8fCAhc2VtdmVyLnNhdGlzZmllcyh0eXBlc2NyaXB0UGtnLnZlcnNpb24sICc+PSA0LjUnKSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdXIgdmVyc2lvbiBvZiBUeXBlU2NyaXB0IGRvZXMgbm90IHN1cHBvcnQgaW5saW5lIHR5cGUgaW1wb3J0cy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFkZCAqb25seSogdGhlIG5ldyBpZGVudGlmaWVycyB0aGF0IGRvbid0IGFscmVhZHkgZXhpc3QsIGFuZCB0cmFjayBhbnkgbmV3IGlkZW50aWZpZXJzIHNvIHdlIGRvbid0IGFkZCB0aGVtIGFnYWluIGluIHRoZSBuZXh0IGxvb3BcbiAgICAgICAgY29uc3QgW3NwZWNpZmllclRleHQsIHVwZGF0ZWRFeGlzdGluZ0lkZW50aWZpZXJzXSA9IHNwZWNpZmllci5pZGVudGlmaWVycy5yZWR1Y2UoKFt0ZXh0LCBzZXRdLCBjdXIpID0+IHtcbiAgICAgICAgICBjb25zdCB0cmltbWVkID0gY3VyLnRyaW0oKTsgLy8gVHJpbSB3aGl0ZXNwYWNlIGJlZm9yZS9hZnRlciB0byBjb21wYXJlIHRvIG91ciBzZXQgb2YgZXhpc3RpbmcgaWRlbnRpZmllcnNcbiAgICAgICAgICBjb25zdCBjdXJXaXRoVHlwZSA9IHRyaW1tZWQubGVuZ3RoID4gMCAmJiBwcmVmZXJJbmxpbmUgJiYgaXNUeXBlU3BlY2lmaWVyID8gYHR5cGUgJHtjdXJ9YCA6IGN1cjtcbiAgICAgICAgICBpZiAoZXhpc3RpbmdJZGVudGlmaWVycy5oYXModHJpbW1lZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBbdGV4dCwgc2V0XTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFt0ZXh0Lmxlbmd0aCA+IDAgPyBgJHt0ZXh0fSwke2N1cldpdGhUeXBlfWAgOiBjdXJXaXRoVHlwZSwgc2V0LmFkZCh0cmltbWVkKV07XG4gICAgICAgIH0sIFsnJywgZXhpc3RpbmdJZGVudGlmaWVyc10pO1xuXG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgbmVlZHNDb21tYSAmJiAhc3BlY2lmaWVyLmlzRW1wdHkgJiYgc3BlY2lmaWVyVGV4dC5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IGAke3Jlc3VsdH0sJHtzcGVjaWZpZXJUZXh0fWBcbiAgICAgICAgICAgIDogYCR7cmVzdWx0fSR7c3BlY2lmaWVyVGV4dH1gLFxuICAgICAgICAgIHNwZWNpZmllci5pc0VtcHR5ID8gbmVlZHNDb21tYSA6IHRydWUsXG4gICAgICAgICAgdXBkYXRlZEV4aXN0aW5nSWRlbnRpZmllcnMsXG4gICAgICAgIF07XG4gICAgICB9LFxuICAgICAgWycnLCAhZmlyc3RIYXNUcmFpbGluZ0NvbW1hICYmICFmaXJzdElzRW1wdHksIGZpcnN0RXhpc3RpbmdJZGVudGlmaWVyc10sXG4gICAgKTtcblxuICAgIGNvbnN0IGZpeGVzID0gW107XG5cbiAgICBpZiAoc2hvdWxkQWRkRGVmYXVsdCAmJiBvcGVuQnJhY2UgPT0gbnVsbCAmJiBzaG91bGRBZGRTcGVjaWZpZXJzKSB7XG4gICAgICAvLyBgaW1wb3J0ICcuL2ZvbydgIOKGkiBgaW1wb3J0IGRlZiwgey4uLn0gZnJvbSAnLi9mb28nYFxuICAgICAgZml4ZXMucHVzaChcbiAgICAgICAgZml4ZXIuaW5zZXJ0VGV4dEFmdGVyKGZpcnN0VG9rZW4sIGAgJHtkZWZhdWx0SW1wb3J0TmFtZX0sIHske3NwZWNpZmllcnNUZXh0fX0gZnJvbWApLFxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKHNob3VsZEFkZERlZmF1bHQgJiYgb3BlbkJyYWNlID09IG51bGwgJiYgIXNob3VsZEFkZFNwZWNpZmllcnMpIHtcbiAgICAgIC8vIGBpbXBvcnQgJy4vZm9vJ2Ag4oaSIGBpbXBvcnQgZGVmIGZyb20gJy4vZm9vJ2BcbiAgICAgIGZpeGVzLnB1c2goZml4ZXIuaW5zZXJ0VGV4dEFmdGVyKGZpcnN0VG9rZW4sIGAgJHtkZWZhdWx0SW1wb3J0TmFtZX0gZnJvbWApKTtcbiAgICB9IGVsc2UgaWYgKHNob3VsZEFkZERlZmF1bHQgJiYgb3BlbkJyYWNlICE9IG51bGwgJiYgY2xvc2VCcmFjZSAhPSBudWxsKSB7XG4gICAgICAvLyBgaW1wb3J0IHsuLi59IGZyb20gJy4vZm9vJ2Ag4oaSIGBpbXBvcnQgZGVmLCB7Li4ufSBmcm9tICcuL2ZvbydgXG4gICAgICBmaXhlcy5wdXNoKGZpeGVyLmluc2VydFRleHRBZnRlcihmaXJzdFRva2VuLCBgICR7ZGVmYXVsdEltcG9ydE5hbWV9LGApKTtcbiAgICAgIGlmIChzaG91bGRBZGRTcGVjaWZpZXJzKSB7XG4gICAgICAgIC8vIGBpbXBvcnQgZGVmLCB7Li4ufSBmcm9tICcuL2ZvbydgIOKGkiBgaW1wb3J0IGRlZiwgey4uLiwgLi4ufSBmcm9tICcuL2ZvbydgXG4gICAgICAgIGZpeGVzLnB1c2goZml4ZXIuaW5zZXJ0VGV4dEJlZm9yZShjbG9zZUJyYWNlLCBzcGVjaWZpZXJzVGV4dCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIXNob3VsZEFkZERlZmF1bHQgJiYgb3BlbkJyYWNlID09IG51bGwgJiYgc2hvdWxkQWRkU3BlY2lmaWVycykge1xuICAgICAgaWYgKGZpcnN0LnNwZWNpZmllcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIC8vIGBpbXBvcnQgJy4vZm9vJ2Ag4oaSIGBpbXBvcnQgey4uLn0gZnJvbSAnLi9mb28nYFxuICAgICAgICBmaXhlcy5wdXNoKGZpeGVyLmluc2VydFRleHRBZnRlcihmaXJzdFRva2VuLCBgIHske3NwZWNpZmllcnNUZXh0fX0gZnJvbWApKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGBpbXBvcnQgZGVmIGZyb20gJy4vZm9vJ2Ag4oaSIGBpbXBvcnQgZGVmLCB7Li4ufSBmcm9tICcuL2ZvbydgXG4gICAgICAgIGZpeGVzLnB1c2goZml4ZXIuaW5zZXJ0VGV4dEFmdGVyKGZpcnN0LnNwZWNpZmllcnNbMF0sIGAsIHske3NwZWNpZmllcnNUZXh0fX1gKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghc2hvdWxkQWRkRGVmYXVsdCAmJiBvcGVuQnJhY2UgIT0gbnVsbCAmJiBjbG9zZUJyYWNlICE9IG51bGwpIHtcbiAgICAgIC8vIGBpbXBvcnQgey4uLn0gJy4vZm9vJ2Ag4oaSIGBpbXBvcnQgey4uLiwgLi4ufSBmcm9tICcuL2ZvbydgXG4gICAgICBmaXhlcy5wdXNoKGZpeGVyLmluc2VydFRleHRCZWZvcmUoY2xvc2VCcmFjZSwgc3BlY2lmaWVyc1RleHQpKTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaW1wb3J0cyB3aG9zZSBzcGVjaWZpZXJzIGhhdmUgYmVlbiBtb3ZlZCBpbnRvIHRoZSBmaXJzdCBpbXBvcnQuXG4gICAgZm9yIChjb25zdCBzcGVjaWZpZXIgb2Ygc3BlY2lmaWVycykge1xuICAgICAgY29uc3QgaW1wb3J0Tm9kZSA9IHNwZWNpZmllci5pbXBvcnROb2RlO1xuICAgICAgZml4ZXMucHVzaChmaXhlci5yZW1vdmUoaW1wb3J0Tm9kZSkpO1xuXG4gICAgICBjb25zdCBjaGFyQWZ0ZXJJbXBvcnRSYW5nZSA9IFtpbXBvcnROb2RlLnJhbmdlWzFdLCBpbXBvcnROb2RlLnJhbmdlWzFdICsgMV07XG4gICAgICBjb25zdCBjaGFyQWZ0ZXJJbXBvcnQgPSBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKGNoYXJBZnRlckltcG9ydFJhbmdlWzBdLCBjaGFyQWZ0ZXJJbXBvcnRSYW5nZVsxXSk7XG4gICAgICBpZiAoY2hhckFmdGVySW1wb3J0ID09PSAnXFxuJykge1xuICAgICAgICBmaXhlcy5wdXNoKGZpeGVyLnJlbW92ZVJhbmdlKGNoYXJBZnRlckltcG9ydFJhbmdlKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGltcG9ydHMgd2hvc2UgZGVmYXVsdCBpbXBvcnQgaGFzIGJlZW4gbW92ZWQgdG8gdGhlIGZpcnN0IGltcG9ydCxcbiAgICAvLyBhbmQgc2lkZS1lZmZlY3Qtb25seSBpbXBvcnRzIHRoYXQgYXJlIHVubmVjZXNzYXJ5IGR1ZSB0byB0aGUgZmlyc3RcbiAgICAvLyBpbXBvcnQuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIHVubmVjZXNzYXJ5SW1wb3J0cykge1xuICAgICAgZml4ZXMucHVzaChmaXhlci5yZW1vdmUobm9kZSkpO1xuXG4gICAgICBjb25zdCBjaGFyQWZ0ZXJJbXBvcnRSYW5nZSA9IFtub2RlLnJhbmdlWzFdLCBub2RlLnJhbmdlWzFdICsgMV07XG4gICAgICBjb25zdCBjaGFyQWZ0ZXJJbXBvcnQgPSBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKGNoYXJBZnRlckltcG9ydFJhbmdlWzBdLCBjaGFyQWZ0ZXJJbXBvcnRSYW5nZVsxXSk7XG4gICAgICBpZiAoY2hhckFmdGVySW1wb3J0ID09PSAnXFxuJykge1xuICAgICAgICBmaXhlcy5wdXNoKGZpeGVyLnJlbW92ZVJhbmdlKGNoYXJBZnRlckltcG9ydFJhbmdlKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpeGVzO1xuICB9O1xufVxuXG5mdW5jdGlvbiBjaGVja0ltcG9ydHMoaW1wb3J0ZWQsIGNvbnRleHQpIHtcbiAgZm9yIChjb25zdCBbbW9kdWxlLCBub2Rlc10gb2YgaW1wb3J0ZWQuZW50cmllcygpKSB7XG4gICAgaWYgKG5vZGVzLmxlbmd0aCA+IDEpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgJyR7bW9kdWxlfScgaW1wb3J0ZWQgbXVsdGlwbGUgdGltZXMuYDtcbiAgICAgIGNvbnN0IFtmaXJzdCwgLi4ucmVzdF0gPSBub2RlcztcbiAgICAgIGNvbnN0IHNvdXJjZUNvZGUgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKTtcbiAgICAgIGNvbnN0IGZpeCA9IGdldEZpeChmaXJzdCwgcmVzdCwgc291cmNlQ29kZSwgY29udGV4dCk7XG5cbiAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgbm9kZTogZmlyc3Quc291cmNlLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICBmaXgsIC8vIEF0dGFjaCB0aGUgYXV0b2ZpeCAoaWYgYW55KSB0byB0aGUgZmlyc3QgaW1wb3J0LlxuICAgICAgfSk7XG5cbiAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiByZXN0KSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgICBub2RlOiBub2RlLnNvdXJjZSxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1ldGE6IHtcbiAgICB0eXBlOiAncHJvYmxlbScsXG4gICAgZG9jczoge1xuICAgICAgY2F0ZWdvcnk6ICdTdHlsZSBndWlkZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZvcmJpZCByZXBlYXRlZCBpbXBvcnQgb2YgdGhlIHNhbWUgbW9kdWxlIGluIG11bHRpcGxlIHBsYWNlcy4nLFxuICAgICAgdXJsOiBkb2NzVXJsKCduby1kdXBsaWNhdGVzJyksXG4gICAgfSxcbiAgICBmaXhhYmxlOiAnY29kZScsXG4gICAgc2NoZW1hOiBbXG4gICAgICB7XG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgY29uc2lkZXJRdWVyeVN0cmluZzoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ3ByZWZlci1pbmxpbmUnOiB7XG4gICAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgfSxcbiAgICBdLFxuICB9LFxuXG4gIGNyZWF0ZShjb250ZXh0KSB7XG4gICAgLy8gUHJlcGFyZSB0aGUgcmVzb2x2ZXIgZnJvbSBvcHRpb25zLlxuICAgIGNvbnN0IGNvbnNpZGVyUXVlcnlTdHJpbmdPcHRpb24gPSBjb250ZXh0Lm9wdGlvbnNbMF1cbiAgICAgICYmIGNvbnRleHQub3B0aW9uc1swXS5jb25zaWRlclF1ZXJ5U3RyaW5nO1xuICAgIGNvbnN0IGRlZmF1bHRSZXNvbHZlciA9IChzb3VyY2VQYXRoKSA9PiByZXNvbHZlKHNvdXJjZVBhdGgsIGNvbnRleHQpIHx8IHNvdXJjZVBhdGg7XG4gICAgY29uc3QgcmVzb2x2ZXIgPSBjb25zaWRlclF1ZXJ5U3RyaW5nT3B0aW9uID8gKHNvdXJjZVBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gc291cmNlUGF0aC5tYXRjaCgvXihbXj9dKilcXD8oLiopJC8pO1xuICAgICAgaWYgKCFwYXJ0cykge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFJlc29sdmVyKHNvdXJjZVBhdGgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2RlZmF1bHRSZXNvbHZlcihwYXJ0c1sxXSl9PyR7cGFydHNbMl19YDtcbiAgICB9IDogZGVmYXVsdFJlc29sdmVyO1xuXG4gICAgY29uc3QgbW9kdWxlTWFwcyA9IG5ldyBNYXAoKTtcblxuICAgIGZ1bmN0aW9uIGdldEltcG9ydE1hcChuKSB7XG4gICAgICBpZiAoIW1vZHVsZU1hcHMuaGFzKG4ucGFyZW50KSkge1xuICAgICAgICBtb2R1bGVNYXBzLnNldChuLnBhcmVudCwge1xuICAgICAgICAgIGltcG9ydGVkOiBuZXcgTWFwKCksXG4gICAgICAgICAgbnNJbXBvcnRlZDogbmV3IE1hcCgpLFxuICAgICAgICAgIGRlZmF1bHRUeXBlc0ltcG9ydGVkOiBuZXcgTWFwKCksXG4gICAgICAgICAgbmFtZWRUeXBlc0ltcG9ydGVkOiBuZXcgTWFwKCksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY29uc3QgbWFwID0gbW9kdWxlTWFwcy5nZXQobi5wYXJlbnQpO1xuICAgICAgY29uc3QgcHJlZmVySW5saW5lID0gY29udGV4dC5vcHRpb25zWzBdICYmIGNvbnRleHQub3B0aW9uc1swXVsncHJlZmVyLWlubGluZSddO1xuICAgICAgaWYgKCFwcmVmZXJJbmxpbmUgJiYgbi5pbXBvcnRLaW5kID09PSAndHlwZScpIHtcbiAgICAgICAgcmV0dXJuIG4uc3BlY2lmaWVycy5sZW5ndGggPiAwICYmIG4uc3BlY2lmaWVyc1swXS50eXBlID09PSAnSW1wb3J0RGVmYXVsdFNwZWNpZmllcicgPyBtYXAuZGVmYXVsdFR5cGVzSW1wb3J0ZWQgOiBtYXAubmFtZWRUeXBlc0ltcG9ydGVkO1xuICAgICAgfVxuICAgICAgaWYgKCFwcmVmZXJJbmxpbmUgJiYgbi5zcGVjaWZpZXJzLnNvbWUoKHNwZWMpID0+IHNwZWMuaW1wb3J0S2luZCA9PT0gJ3R5cGUnKSkge1xuICAgICAgICByZXR1cm4gbWFwLm5hbWVkVHlwZXNJbXBvcnRlZDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGhhc05hbWVzcGFjZShuKSA/IG1hcC5uc0ltcG9ydGVkIDogbWFwLmltcG9ydGVkO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBJbXBvcnREZWNsYXJhdGlvbihuKSB7XG4gICAgICAgIC8vIHJlc29sdmVkIHBhdGggd2lsbCBjb3ZlciBhbGlhc2VkIGR1cGxpY2F0ZXNcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRQYXRoID0gcmVzb2x2ZXIobi5zb3VyY2UudmFsdWUpO1xuICAgICAgICBjb25zdCBpbXBvcnRNYXAgPSBnZXRJbXBvcnRNYXAobik7XG5cbiAgICAgICAgaWYgKGltcG9ydE1hcC5oYXMocmVzb2x2ZWRQYXRoKSkge1xuICAgICAgICAgIGltcG9ydE1hcC5nZXQocmVzb2x2ZWRQYXRoKS5wdXNoKG4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGltcG9ydE1hcC5zZXQocmVzb2x2ZWRQYXRoLCBbbl0pO1xuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICAnUHJvZ3JhbTpleGl0JygpIHtcbiAgICAgICAgZm9yIChjb25zdCBtYXAgb2YgbW9kdWxlTWFwcy52YWx1ZXMoKSkge1xuICAgICAgICAgIGNoZWNrSW1wb3J0cyhtYXAuaW1wb3J0ZWQsIGNvbnRleHQpO1xuICAgICAgICAgIGNoZWNrSW1wb3J0cyhtYXAubnNJbXBvcnRlZCwgY29udGV4dCk7XG4gICAgICAgICAgY2hlY2tJbXBvcnRzKG1hcC5kZWZhdWx0VHlwZXNJbXBvcnRlZCwgY29udGV4dCk7XG4gICAgICAgICAgY2hlY2tJbXBvcnRzKG1hcC5uYW1lZFR5cGVzSW1wb3J0ZWQsIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH07XG4gIH0sXG59O1xuIl19