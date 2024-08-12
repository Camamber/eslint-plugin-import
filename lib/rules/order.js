'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();

var _minimatch = require('minimatch');var _minimatch2 = _interopRequireDefault(_minimatch);
var _arrayIncludes = require('array-includes');var _arrayIncludes2 = _interopRequireDefault(_arrayIncludes);
var _object = require('object.groupby');var _object2 = _interopRequireDefault(_object);

var _importType = require('../core/importType');var _importType2 = _interopRequireDefault(_importType);
var _staticRequire = require('../core/staticRequire');var _staticRequire2 = _interopRequireDefault(_staticRequire);
var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}

var defaultGroups = ['builtin', 'external', 'parent', 'sibling', 'index'];

// REPORTING AND FIXING

function reverse(array) {
  return array.map(function (v) {
    return Object.assign({}, v, { rank: -v.rank });
  }).reverse();
}

function getTokensOrCommentsAfter(sourceCode, node, count) {
  var currentNodeOrToken = node;
  var result = [];
  for (var i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentAfter(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result;
}

function getTokensOrCommentsBefore(sourceCode, node, count) {
  var currentNodeOrToken = node;
  var result = [];
  for (var i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentBefore(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result.reverse();
}

function takeTokensAfterWhile(sourceCode, node, condition) {
  var tokens = getTokensOrCommentsAfter(sourceCode, node, 100);
  var result = [];
  for (var i = 0; i < tokens.length; i++) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result;
}

function takeTokensBeforeWhile(sourceCode, node, condition) {
  var tokens = getTokensOrCommentsBefore(sourceCode, node, 100);
  var result = [];
  for (var i = tokens.length - 1; i >= 0; i--) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result.reverse();
}

function findOutOfOrder(imported) {
  if (imported.length === 0) {
    return [];
  }
  var maxSeenRankNode = imported[0];
  return imported.filter(function (importedModule) {
    var res = importedModule.rank < maxSeenRankNode.rank;
    if (maxSeenRankNode.rank < importedModule.rank) {
      maxSeenRankNode = importedModule;
    }
    return res;
  });
}

function findRootNode(node) {
  var parent = node;
  while (parent.parent != null && parent.parent.body == null) {
    parent = parent.parent;
  }
  return parent;
}

function commentOnSameLineAs(node) {
  return function (token) {return (token.type === 'Block' || token.type === 'Line') &&
    token.loc.start.line === token.loc.end.line &&
    token.loc.end.line === node.loc.end.line;};
}

function findEndOfLineWithComments(sourceCode, node) {
  var tokensToEndOfLine = takeTokensAfterWhile(sourceCode, node, commentOnSameLineAs(node));
  var endOfTokens = tokensToEndOfLine.length > 0 ?
  tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1] :
  node.range[1];
  var result = endOfTokens;
  for (var i = endOfTokens; i < sourceCode.text.length; i++) {
    if (sourceCode.text[i] === '\n') {
      result = i + 1;
      break;
    }
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t' && sourceCode.text[i] !== '\r') {
      break;
    }
    result = i + 1;
  }
  return result;
}

function findStartOfLineWithComments(sourceCode, node) {
  var tokensToEndOfLine = takeTokensBeforeWhile(sourceCode, node, commentOnSameLineAs(node));
  var startOfTokens = tokensToEndOfLine.length > 0 ? tokensToEndOfLine[0].range[0] : node.range[0];
  var result = startOfTokens;
  for (var i = startOfTokens - 1; i > 0; i--) {
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t') {
      break;
    }
    result = i;
  }
  return result;
}

function isRequireExpression(expr) {
  return expr != null &&
  expr.type === 'CallExpression' &&
  expr.callee != null &&
  expr.callee.name === 'require' &&
  expr.arguments != null &&
  expr.arguments.length === 1 &&
  expr.arguments[0].type === 'Literal';
}

function isSupportedRequireModule(node) {
  if (node.type !== 'VariableDeclaration') {
    return false;
  }
  if (node.declarations.length !== 1) {
    return false;
  }
  var decl = node.declarations[0];
  var isPlainRequire = decl.id && (
  decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern') &&
  isRequireExpression(decl.init);
  var isRequireWithMemberExpression = decl.id && (
  decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern') &&
  decl.init != null &&
  decl.init.type === 'CallExpression' &&
  decl.init.callee != null &&
  decl.init.callee.type === 'MemberExpression' &&
  isRequireExpression(decl.init.callee.object);
  return isPlainRequire || isRequireWithMemberExpression;
}

function isPlainImportModule(node) {
  return node.type === 'ImportDeclaration' && node.specifiers != null && node.specifiers.length > 0;
}

function isPlainImportEquals(node) {
  return node.type === 'TSImportEqualsDeclaration' && node.moduleReference.expression;
}

function canCrossNodeWhileReorder(node) {
  return isSupportedRequireModule(node) || isPlainImportModule(node) || isPlainImportEquals(node);
}

function canReorderItems(firstNode, secondNode) {
  var parent = firstNode.parent;var _sort =
  [
  parent.body.indexOf(firstNode),
  parent.body.indexOf(secondNode)].
  sort(),_sort2 = _slicedToArray(_sort, 2),firstIndex = _sort2[0],secondIndex = _sort2[1];
  var nodesBetween = parent.body.slice(firstIndex, secondIndex + 1);var _iteratorNormalCompletion = true;var _didIteratorError = false;var _iteratorError = undefined;try {
    for (var _iterator = nodesBetween[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {var nodeBetween = _step.value;
      if (!canCrossNodeWhileReorder(nodeBetween)) {
        return false;
      }
    }} catch (err) {_didIteratorError = true;_iteratorError = err;} finally {try {if (!_iteratorNormalCompletion && _iterator['return']) {_iterator['return']();}} finally {if (_didIteratorError) {throw _iteratorError;}}}
  return true;
}

function makeImportDescription(node) {
  if (node.node.importKind === 'type') {
    return 'type import';
  }
  if (node.node.importKind === 'typeof') {
    return 'typeof import';
  }
  return 'import';
}

function fixOutOfOrder(context, firstNode, secondNode, order) {
  var sourceCode = context.getSourceCode();

  var firstRoot = findRootNode(firstNode.node);
  var firstRootStart = findStartOfLineWithComments(sourceCode, firstRoot);
  var firstRootEnd = findEndOfLineWithComments(sourceCode, firstRoot);

  var secondRoot = findRootNode(secondNode.node);
  var secondRootStart = findStartOfLineWithComments(sourceCode, secondRoot);
  var secondRootEnd = findEndOfLineWithComments(sourceCode, secondRoot);
  var canFix = canReorderItems(firstRoot, secondRoot);

  var newCode = sourceCode.text.substring(secondRootStart, secondRootEnd);
  if (newCode[newCode.length - 1] !== '\n') {
    newCode = String(newCode) + '\n';
  }

  var firstImport = String(makeImportDescription(firstNode)) + ' of `' + String(firstNode.displayName) + '`';
  var secondImport = '`' + String(secondNode.displayName) + '` ' + String(makeImportDescription(secondNode));
  var message = secondImport + ' should occur ' + String(order) + ' ' + firstImport;

  if (order === 'before') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && function (fixer) {return fixer.replaceTextRange(
        [firstRootStart, secondRootEnd],
        newCode + sourceCode.text.substring(firstRootStart, secondRootStart));} });


  } else if (order === 'after') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && function (fixer) {return fixer.replaceTextRange(
        [secondRootStart, firstRootEnd],
        sourceCode.text.substring(secondRootEnd, firstRootEnd) + newCode);} });


  }
}

function reportOutOfOrder(context, imported, outOfOrder, order) {
  outOfOrder.forEach(function (imp) {
    var found = imported.find(function () {function hasHigherRank(importedItem) {
        return importedItem.rank > imp.rank;
      }return hasHigherRank;}());
    fixOutOfOrder(context, found, imp, order);
  });
}

function makeOutOfOrderReport(context, imported) {
  var outOfOrder = findOutOfOrder(imported);
  if (!outOfOrder.length) {
    return;
  }

  // There are things to report. Try to minimize the number of reported errors.
  var reversedImported = reverse(imported);
  var reversedOrder = findOutOfOrder(reversedImported);
  if (reversedOrder.length < outOfOrder.length) {
    reportOutOfOrder(context, reversedImported, reversedOrder, 'after');
    return;
  }
  reportOutOfOrder(context, imported, outOfOrder, 'before');
}

var compareString = function compareString(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

/** Some parsers (languages without types) don't provide ImportKind */
var DEAFULT_IMPORT_KIND = 'value';
var getNormalizedValue = function getNormalizedValue(node, toLowerCase) {
  var value = node.value;
  return toLowerCase ? String(value).toLowerCase() : value;
};

function getSorter(alphabetizeOptions) {
  var multiplier = alphabetizeOptions.order === 'asc' ? 1 : -1;
  var orderImportKind = alphabetizeOptions.orderImportKind;
  var multiplierImportKind = orderImportKind !== 'ignore' && (
  alphabetizeOptions.orderImportKind === 'asc' ? 1 : -1);

  return function () {function importsSorter(nodeA, nodeB) {
      var importA = getNormalizedValue(nodeA, alphabetizeOptions.caseInsensitive);
      var importB = getNormalizedValue(nodeB, alphabetizeOptions.caseInsensitive);
      var result = 0;

      if (!(0, _arrayIncludes2['default'])(importA, '/') && !(0, _arrayIncludes2['default'])(importB, '/')) {
        result = compareString(importA, importB);
      } else {
        var A = importA.split('/');
        var B = importB.split('/');
        var a = A.length;
        var b = B.length;

        for (var i = 0; i < Math.min(a, b); i++) {
          result = compareString(A[i], B[i]);
          if (result) {break;}
        }

        if (!result && a !== b) {
          result = a < b ? -1 : 1;
        }
      }

      result = result * multiplier;

      // In case the paths are equal (result === 0), sort them by importKind
      if (!result && multiplierImportKind) {
        result = multiplierImportKind * compareString(
        nodeA.node.importKind || DEAFULT_IMPORT_KIND,
        nodeB.node.importKind || DEAFULT_IMPORT_KIND);

      }

      return result;
    }return importsSorter;}();
}

function mutateRanksToAlphabetize(imported, alphabetizeOptions) {
  var groupedByRanks = (0, _object2['default'])(imported, function (item) {return item.rank;});

  var sorterFn = getSorter(alphabetizeOptions);

  // sort group keys so that they can be iterated on in order
  var groupRanks = Object.keys(groupedByRanks).sort(function (a, b) {
    return a - b;
  });

  // sort imports locally within their group
  groupRanks.forEach(function (groupRank) {
    groupedByRanks[groupRank].sort(sorterFn);
  });

  // assign globally unique rank to each import
  var newRank = 0;
  var alphabetizedRanks = groupRanks.reduce(function (acc, groupRank) {
    groupedByRanks[groupRank].forEach(function (importedItem) {
      acc[String(importedItem.value) + '|' + String(importedItem.node.importKind)] = parseInt(groupRank, 10) + newRank;
      newRank += 1;
    });
    return acc;
  }, {});

  // mutate the original group-rank with alphabetized-rank
  imported.forEach(function (importedItem) {
    importedItem.rank = alphabetizedRanks[String(importedItem.value) + '|' + String(importedItem.node.importKind)];
  });
}

// DETECTING

function computePathRank(ranks, pathGroups, path, maxPosition) {
  for (var i = 0, l = pathGroups.length; i < l; i++) {var _pathGroups$i =
    pathGroups[i],pattern = _pathGroups$i.pattern,patternOptions = _pathGroups$i.patternOptions,patternType = _pathGroups$i.patternType,group = _pathGroups$i.group,_pathGroups$i$positio = _pathGroups$i.position,position = _pathGroups$i$positio === undefined ? 1 : _pathGroups$i$positio;
    switch (patternType) {
      case 're':
        if (new RegExp(pattern, patternOptions).test(path)) {
          return ranks[group] + position / maxPosition;
        }
        break;

      case 'glob':
      default:
        if ((0, _minimatch2['default'])(path, pattern, patternOptions || { nocomment: true })) {
          return ranks[group] + position / maxPosition;
        }
        break;}

  }
}

function computeRank(context, ranks, importEntry, excludedImportTypes) {
  var impType = void 0;
  var rank = void 0;
  if (importEntry.type === 'import:object') {
    impType = 'object';
  } else if (importEntry.node.importKind === 'type' && ranks.omittedTypes.indexOf('type') === -1) {
    impType = 'type';
  } else {
    impType = (0, _importType2['default'])(importEntry.value, context);
  }
  if (!excludedImportTypes.has(impType)) {
    rank = computePathRank(ranks.groups, ranks.pathGroups, importEntry.value, ranks.maxPosition);
  }
  if (typeof rank === 'undefined') {
    rank = ranks.groups[impType];
  }
  if (importEntry.type !== 'import' && !importEntry.type.startsWith('import:')) {
    rank += 100;
  }

  return rank;
}

function registerNode(context, importEntry, ranks, imported, excludedImportTypes) {
  var rank = computeRank(context, ranks, importEntry, excludedImportTypes);
  if (rank !== -1) {
    imported.push(Object.assign({}, importEntry, { rank: rank }));
  }
}

function getRequireBlock(node) {
  var n = node;
  // Handle cases like `const baz = require('foo').bar.baz`
  // and `const foo = require('foo')()`
  while (
  n.parent.type === 'MemberExpression' && n.parent.object === n ||
  n.parent.type === 'CallExpression' && n.parent.callee === n)
  {
    n = n.parent;
  }
  if (
  n.parent.type === 'VariableDeclarator' &&
  n.parent.parent.type === 'VariableDeclaration' &&
  n.parent.parent.parent.type === 'Program')
  {
    return n.parent.parent.parent;
  }
}

var types = ['builtin', 'external', 'internal', 'unknown', 'parent', 'sibling', 'index', 'object', 'type'];

// Creates an object with type-rank pairs.
// Example: { index: 0, sibling: 1, parent: 1, external: 1, builtin: 2, internal: 2 }
// Will throw an error if it contains a type that does not exist, or has a duplicate
function convertGroupsToRanks(groups) {
  var rankObject = groups.reduce(function (res, group, index) {
    [].concat(group).forEach(function (groupItem) {
      if (types.indexOf(groupItem.split(':')[0]) === -1) {
        throw new Error('Incorrect configuration of the rule: Unknown type `' + String(JSON.stringify(groupItem)) + '`');
      }
      if (res[groupItem] !== undefined) {
        throw new Error('Incorrect configuration of the rule: `' + String(groupItem) + '` is duplicated');
      }
      res[groupItem] = index * 2;
    });
    return res;
  }, {});

  var omittedTypes = types.filter(function (type) {
    return typeof rankObject[type] === 'undefined';
  });

  var ranks = omittedTypes.reduce(function (res, type) {
    res[type] = groups.length * 2;
    return res;
  }, rankObject);

  return { groups: ranks, omittedTypes: omittedTypes };
}

function convertPathGroupsForRanks(pathGroups) {
  var after = {};
  var before = {};

  var transformed = pathGroups.map(function (pathGroup, index) {var
    group = pathGroup.group,positionString = pathGroup.position;
    var position = 0;
    if (positionString === 'after') {
      if (!after[group]) {
        after[group] = 1;
      }
      position = after[group]++;
    } else if (positionString === 'before') {
      if (!before[group]) {
        before[group] = [];
      }
      before[group].push(index);
    }

    return Object.assign({}, pathGroup, { position: position });
  });

  var maxPosition = 1;

  Object.keys(before).forEach(function (group) {
    var groupLength = before[group].length;
    before[group].forEach(function (groupIndex, index) {
      transformed[groupIndex].position = -1 * (groupLength - index);
    });
    maxPosition = Math.max(maxPosition, groupLength);
  });

  Object.keys(after).forEach(function (key) {
    var groupNextPosition = after[key];
    maxPosition = Math.max(maxPosition, groupNextPosition - 1);
  });

  return {
    pathGroups: transformed,
    maxPosition: maxPosition > 10 ? Math.pow(10, Math.ceil(Math.log10(maxPosition))) : 10 };

}

function fixNewLineAfterImport(context, previousImport) {
  var prevRoot = findRootNode(previousImport.node);
  var tokensToEndOfLine = takeTokensAfterWhile(
  context.getSourceCode(), prevRoot, commentOnSameLineAs(prevRoot));

  var endOfLine = prevRoot.range[1];
  if (tokensToEndOfLine.length > 0) {
    endOfLine = tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1];
  }
  return function (fixer) {return fixer.insertTextAfterRange([prevRoot.range[0], endOfLine], '\n');};
}

function removeNewLineAfterImport(context, currentImport, previousImport) {
  var sourceCode = context.getSourceCode();
  var prevRoot = findRootNode(previousImport.node);
  var currRoot = findRootNode(currentImport.node);
  var rangeToRemove = [
  findEndOfLineWithComments(sourceCode, prevRoot),
  findStartOfLineWithComments(sourceCode, currRoot)];

  if (/^\s*$/.test(sourceCode.text.substring(rangeToRemove[0], rangeToRemove[1]))) {
    return function (fixer) {return fixer.removeRange(rangeToRemove);};
  }
  return undefined;
}

function makeNewlinesBetweenReport(context, imported, newlinesBetweenImports, distinctGroup) {
  var getNumberOfEmptyLinesBetween = function getNumberOfEmptyLinesBetween(currentImport, previousImport) {
    var linesBetweenImports = context.getSourceCode().lines.slice(
    previousImport.node.loc.end.line,
    currentImport.node.loc.start.line - 1);


    return linesBetweenImports.filter(function (line) {return !line.trim().length;}).length;
  };
  var getIsStartOfDistinctGroup = function getIsStartOfDistinctGroup(currentImport, previousImport) {return currentImport.rank - 1 >= previousImport.rank;};
  var previousImport = imported[0];

  imported.slice(1).forEach(function (currentImport) {
    var emptyLinesBetween = getNumberOfEmptyLinesBetween(currentImport, previousImport);
    var isStartOfDistinctGroup = getIsStartOfDistinctGroup(currentImport, previousImport);

    if (newlinesBetweenImports === 'always' ||
    newlinesBetweenImports === 'always-and-inside-groups') {
      if (currentImport.rank !== previousImport.rank && emptyLinesBetween === 0) {
        if (distinctGroup || !distinctGroup && isStartOfDistinctGroup) {
          context.report({
            node: previousImport.node,
            message: 'There should be at least one empty line between import groups',
            fix: fixNewLineAfterImport(context, previousImport) });

        }
      } else if (emptyLinesBetween > 0 &&
      newlinesBetweenImports !== 'always-and-inside-groups') {
        if (distinctGroup && currentImport.rank === previousImport.rank || !distinctGroup && !isStartOfDistinctGroup) {
          context.report({
            node: previousImport.node,
            message: 'There should be no empty line within import group',
            fix: removeNewLineAfterImport(context, currentImport, previousImport) });

        }
      }
    } else if (emptyLinesBetween > 0) {
      context.report({
        node: previousImport.node,
        message: 'There should be no empty line between import groups',
        fix: removeNewLineAfterImport(context, currentImport, previousImport) });

    }

    previousImport = currentImport;
  });
}

function getAlphabetizeConfig(options) {
  var alphabetize = options.alphabetize || {};
  var order = alphabetize.order || 'ignore';
  var orderImportKind = alphabetize.orderImportKind || 'ignore';
  var caseInsensitive = alphabetize.caseInsensitive || false;

  return { order: order, orderImportKind: orderImportKind, caseInsensitive: caseInsensitive };
}

// TODO, semver-major: Change the default of "distinctGroup" from true to false
var defaultDistinctGroup = true;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      category: 'Style guide',
      description: 'Enforce a convention in module import order.',
      url: (0, _docsUrl2['default'])('order') },


    fixable: 'code',
    schema: [
    {
      type: 'object',
      properties: {
        groups: {
          type: 'array' },

        pathGroupsExcludedImportTypes: {
          type: 'array' },

        distinctGroup: {
          type: 'boolean',
          'default': defaultDistinctGroup },

        pathGroups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string' },

              patternOptions: {
                type: 'object' },

              patternType: {
                type: 'string',
                'enum': ['re', 'glob'] },

              group: {
                type: 'string' },

              position: {
                type: 'string',
                'enum': ['after', 'before'] } },


            additionalProperties: false,
            required: ['pattern', 'group'] } },


        'newlines-between': {
          'enum': [
          'ignore',
          'always',
          'always-and-inside-groups',
          'never'] },


        alphabetize: {
          type: 'object',
          properties: {
            caseInsensitive: {
              type: 'boolean',
              'default': false },

            order: {
              'enum': ['ignore', 'asc', 'desc'],
              'default': 'ignore' },

            orderImportKind: {
              'enum': ['ignore', 'asc', 'desc'],
              'default': 'ignore' } },


          additionalProperties: false },

        warnOnUnassignedImports: {
          type: 'boolean',
          'default': false } },


      additionalProperties: false }] },




  create: function () {function importOrderRule(context) {
      var options = context.options[0] || {};
      var newlinesBetweenImports = options['newlines-between'] || 'ignore';
      var pathGroupsExcludedImportTypes = new Set(options.pathGroupsExcludedImportTypes || ['builtin', 'external', 'object']);
      var alphabetize = getAlphabetizeConfig(options);
      var distinctGroup = options.distinctGroup == null ? defaultDistinctGroup : !!options.distinctGroup;
      var ranks = void 0;

      try {var _convertPathGroupsFor =
        convertPathGroupsForRanks(options.pathGroups || []),pathGroups = _convertPathGroupsFor.pathGroups,maxPosition = _convertPathGroupsFor.maxPosition;var _convertGroupsToRanks =
        convertGroupsToRanks(options.groups || defaultGroups),groups = _convertGroupsToRanks.groups,omittedTypes = _convertGroupsToRanks.omittedTypes;
        ranks = {
          groups: groups,
          omittedTypes: omittedTypes,
          pathGroups: pathGroups,
          maxPosition: maxPosition };

      } catch (error) {
        // Malformed configuration
        return {
          Program: function () {function Program(node) {
              context.report(node, error.message);
            }return Program;}() };

      }
      var importMap = new Map();

      function getBlockImports(node) {
        if (!importMap.has(node)) {
          importMap.set(node, []);
        }
        return importMap.get(node);
      }

      return {
        ImportDeclaration: function () {function handleImports(node) {
            // Ignoring unassigned imports unless warnOnUnassignedImports is set
            if (node.specifiers.length || options.warnOnUnassignedImports) {
              var name = node.source.value;
              registerNode(
              context,
              {
                node: node,
                value: name,
                displayName: name,
                type: 'import' },

              ranks,
              getBlockImports(node.parent),
              pathGroupsExcludedImportTypes);

            }
          }return handleImports;}(),
        TSImportEqualsDeclaration: function () {function handleImports(node) {
            var displayName = void 0;
            var value = void 0;
            var type = void 0;
            // skip "export import"s
            if (node.isExport) {
              return;
            }
            if (node.moduleReference.type === 'TSExternalModuleReference') {
              value = node.moduleReference.expression.value;
              displayName = value;
              type = 'import';
            } else {
              value = '';
              displayName = context.getSourceCode().getText(node.moduleReference);
              type = 'import:object';
            }
            registerNode(
            context,
            {
              node: node,
              value: value,
              displayName: displayName,
              type: type },

            ranks,
            getBlockImports(node.parent),
            pathGroupsExcludedImportTypes);

          }return handleImports;}(),
        CallExpression: function () {function handleRequires(node) {
            if (!(0, _staticRequire2['default'])(node)) {
              return;
            }
            var block = getRequireBlock(node);
            if (!block) {
              return;
            }
            var name = node.arguments[0].value;
            registerNode(
            context,
            {
              node: node,
              value: name,
              displayName: name,
              type: 'require' },

            ranks,
            getBlockImports(block),
            pathGroupsExcludedImportTypes);

          }return handleRequires;}(),
        'Program:exit': function () {function reportAndReset() {
            importMap.forEach(function (imported) {
              if (newlinesBetweenImports !== 'ignore') {
                makeNewlinesBetweenReport(context, imported, newlinesBetweenImports, distinctGroup);
              }

              if (alphabetize.order !== 'ignore') {
                mutateRanksToAlphabetize(imported, alphabetize);
              }

              makeOutOfOrderReport(context, imported);
            });

            importMap.clear();
          }return reportAndReset;}() };

    }return importOrderRule;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9vcmRlci5qcyJdLCJuYW1lcyI6WyJkZWZhdWx0R3JvdXBzIiwicmV2ZXJzZSIsImFycmF5IiwibWFwIiwidiIsInJhbmsiLCJnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIiLCJzb3VyY2VDb2RlIiwibm9kZSIsImNvdW50IiwiY3VycmVudE5vZGVPclRva2VuIiwicmVzdWx0IiwiaSIsImdldFRva2VuT3JDb21tZW50QWZ0ZXIiLCJwdXNoIiwiZ2V0VG9rZW5zT3JDb21tZW50c0JlZm9yZSIsImdldFRva2VuT3JDb21tZW50QmVmb3JlIiwidGFrZVRva2Vuc0FmdGVyV2hpbGUiLCJjb25kaXRpb24iLCJ0b2tlbnMiLCJsZW5ndGgiLCJ0YWtlVG9rZW5zQmVmb3JlV2hpbGUiLCJmaW5kT3V0T2ZPcmRlciIsImltcG9ydGVkIiwibWF4U2VlblJhbmtOb2RlIiwiZmlsdGVyIiwiaW1wb3J0ZWRNb2R1bGUiLCJyZXMiLCJmaW5kUm9vdE5vZGUiLCJwYXJlbnQiLCJib2R5IiwiY29tbWVudE9uU2FtZUxpbmVBcyIsInRva2VuIiwidHlwZSIsImxvYyIsInN0YXJ0IiwibGluZSIsImVuZCIsImZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMiLCJ0b2tlbnNUb0VuZE9mTGluZSIsImVuZE9mVG9rZW5zIiwicmFuZ2UiLCJ0ZXh0IiwiZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzIiwic3RhcnRPZlRva2VucyIsImlzUmVxdWlyZUV4cHJlc3Npb24iLCJleHByIiwiY2FsbGVlIiwibmFtZSIsImFyZ3VtZW50cyIsImlzU3VwcG9ydGVkUmVxdWlyZU1vZHVsZSIsImRlY2xhcmF0aW9ucyIsImRlY2wiLCJpc1BsYWluUmVxdWlyZSIsImlkIiwiaW5pdCIsImlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uIiwib2JqZWN0IiwiaXNQbGFpbkltcG9ydE1vZHVsZSIsInNwZWNpZmllcnMiLCJpc1BsYWluSW1wb3J0RXF1YWxzIiwibW9kdWxlUmVmZXJlbmNlIiwiZXhwcmVzc2lvbiIsImNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlciIsImNhblJlb3JkZXJJdGVtcyIsImZpcnN0Tm9kZSIsInNlY29uZE5vZGUiLCJpbmRleE9mIiwic29ydCIsImZpcnN0SW5kZXgiLCJzZWNvbmRJbmRleCIsIm5vZGVzQmV0d2VlbiIsInNsaWNlIiwibm9kZUJldHdlZW4iLCJtYWtlSW1wb3J0RGVzY3JpcHRpb24iLCJpbXBvcnRLaW5kIiwiZml4T3V0T2ZPcmRlciIsImNvbnRleHQiLCJvcmRlciIsImdldFNvdXJjZUNvZGUiLCJmaXJzdFJvb3QiLCJmaXJzdFJvb3RTdGFydCIsImZpcnN0Um9vdEVuZCIsInNlY29uZFJvb3QiLCJzZWNvbmRSb290U3RhcnQiLCJzZWNvbmRSb290RW5kIiwiY2FuRml4IiwibmV3Q29kZSIsInN1YnN0cmluZyIsImZpcnN0SW1wb3J0IiwiZGlzcGxheU5hbWUiLCJzZWNvbmRJbXBvcnQiLCJtZXNzYWdlIiwicmVwb3J0IiwiZml4IiwiZml4ZXIiLCJyZXBsYWNlVGV4dFJhbmdlIiwicmVwb3J0T3V0T2ZPcmRlciIsIm91dE9mT3JkZXIiLCJmb3JFYWNoIiwiaW1wIiwiZm91bmQiLCJmaW5kIiwiaGFzSGlnaGVyUmFuayIsImltcG9ydGVkSXRlbSIsIm1ha2VPdXRPZk9yZGVyUmVwb3J0IiwicmV2ZXJzZWRJbXBvcnRlZCIsInJldmVyc2VkT3JkZXIiLCJjb21wYXJlU3RyaW5nIiwiYSIsImIiLCJERUFGVUxUX0lNUE9SVF9LSU5EIiwiZ2V0Tm9ybWFsaXplZFZhbHVlIiwidG9Mb3dlckNhc2UiLCJ2YWx1ZSIsIlN0cmluZyIsImdldFNvcnRlciIsImFscGhhYmV0aXplT3B0aW9ucyIsIm11bHRpcGxpZXIiLCJvcmRlckltcG9ydEtpbmQiLCJtdWx0aXBsaWVySW1wb3J0S2luZCIsImltcG9ydHNTb3J0ZXIiLCJub2RlQSIsIm5vZGVCIiwiaW1wb3J0QSIsImNhc2VJbnNlbnNpdGl2ZSIsImltcG9ydEIiLCJBIiwic3BsaXQiLCJCIiwiTWF0aCIsIm1pbiIsIm11dGF0ZVJhbmtzVG9BbHBoYWJldGl6ZSIsImdyb3VwZWRCeVJhbmtzIiwiaXRlbSIsInNvcnRlckZuIiwiZ3JvdXBSYW5rcyIsIk9iamVjdCIsImtleXMiLCJncm91cFJhbmsiLCJuZXdSYW5rIiwiYWxwaGFiZXRpemVkUmFua3MiLCJyZWR1Y2UiLCJhY2MiLCJwYXJzZUludCIsImNvbXB1dGVQYXRoUmFuayIsInJhbmtzIiwicGF0aEdyb3VwcyIsInBhdGgiLCJtYXhQb3NpdGlvbiIsImwiLCJwYXR0ZXJuIiwicGF0dGVybk9wdGlvbnMiLCJwYXR0ZXJuVHlwZSIsImdyb3VwIiwicG9zaXRpb24iLCJSZWdFeHAiLCJ0ZXN0Iiwibm9jb21tZW50IiwiY29tcHV0ZVJhbmsiLCJpbXBvcnRFbnRyeSIsImV4Y2x1ZGVkSW1wb3J0VHlwZXMiLCJpbXBUeXBlIiwib21pdHRlZFR5cGVzIiwiaGFzIiwiZ3JvdXBzIiwic3RhcnRzV2l0aCIsInJlZ2lzdGVyTm9kZSIsImdldFJlcXVpcmVCbG9jayIsIm4iLCJ0eXBlcyIsImNvbnZlcnRHcm91cHNUb1JhbmtzIiwicmFua09iamVjdCIsImluZGV4IiwiY29uY2F0IiwiZ3JvdXBJdGVtIiwiRXJyb3IiLCJKU09OIiwic3RyaW5naWZ5IiwidW5kZWZpbmVkIiwiY29udmVydFBhdGhHcm91cHNGb3JSYW5rcyIsImFmdGVyIiwiYmVmb3JlIiwidHJhbnNmb3JtZWQiLCJwYXRoR3JvdXAiLCJwb3NpdGlvblN0cmluZyIsImdyb3VwTGVuZ3RoIiwiZ3JvdXBJbmRleCIsIm1heCIsImtleSIsImdyb3VwTmV4dFBvc2l0aW9uIiwicG93IiwiY2VpbCIsImxvZzEwIiwiZml4TmV3TGluZUFmdGVySW1wb3J0IiwicHJldmlvdXNJbXBvcnQiLCJwcmV2Um9vdCIsImVuZE9mTGluZSIsImluc2VydFRleHRBZnRlclJhbmdlIiwicmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0IiwiY3VycmVudEltcG9ydCIsImN1cnJSb290IiwicmFuZ2VUb1JlbW92ZSIsInJlbW92ZVJhbmdlIiwibWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydCIsIm5ld2xpbmVzQmV0d2VlbkltcG9ydHMiLCJkaXN0aW5jdEdyb3VwIiwiZ2V0TnVtYmVyT2ZFbXB0eUxpbmVzQmV0d2VlbiIsImxpbmVzQmV0d2VlbkltcG9ydHMiLCJsaW5lcyIsInRyaW0iLCJnZXRJc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZW1wdHlMaW5lc0JldHdlZW4iLCJpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZ2V0QWxwaGFiZXRpemVDb25maWciLCJvcHRpb25zIiwiYWxwaGFiZXRpemUiLCJkZWZhdWx0RGlzdGluY3RHcm91cCIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwiZG9jcyIsImNhdGVnb3J5IiwiZGVzY3JpcHRpb24iLCJ1cmwiLCJmaXhhYmxlIiwic2NoZW1hIiwicHJvcGVydGllcyIsInBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzIiwiaXRlbXMiLCJhZGRpdGlvbmFsUHJvcGVydGllcyIsInJlcXVpcmVkIiwid2Fybk9uVW5hc3NpZ25lZEltcG9ydHMiLCJjcmVhdGUiLCJpbXBvcnRPcmRlclJ1bGUiLCJTZXQiLCJlcnJvciIsIlByb2dyYW0iLCJpbXBvcnRNYXAiLCJNYXAiLCJnZXRCbG9ja0ltcG9ydHMiLCJzZXQiLCJnZXQiLCJJbXBvcnREZWNsYXJhdGlvbiIsImhhbmRsZUltcG9ydHMiLCJzb3VyY2UiLCJUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uIiwiaXNFeHBvcnQiLCJnZXRUZXh0IiwiQ2FsbEV4cHJlc3Npb24iLCJoYW5kbGVSZXF1aXJlcyIsImJsb2NrIiwicmVwb3J0QW5kUmVzZXQiLCJjbGVhciJdLCJtYXBwaW5ncyI6IkFBQUEsYTs7QUFFQSxzQztBQUNBLCtDO0FBQ0Esd0M7O0FBRUEsZ0Q7QUFDQSxzRDtBQUNBLHFDOztBQUVBLElBQU1BLGdCQUFnQixDQUFDLFNBQUQsRUFBWSxVQUFaLEVBQXdCLFFBQXhCLEVBQWtDLFNBQWxDLEVBQTZDLE9BQTdDLENB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L0gsT0FBMUIsRUFBbUN0RCxRQUFuQyxFQUE2Q3NMLHNCQUE3QyxFQUFxRUMsYUFBckU7QUFDRDs7QUFFRCxrQkFBSVUsWUFBWTFJLEtBQVosS0FBc0IsUUFBMUIsRUFBb0M7QUFDbENzRCx5Q0FBeUI3RyxRQUF6QixFQUFtQ2lNLFdBQW5DO0FBQ0Q7O0FBRUQvRyxtQ0FBcUI1QixPQUFyQixFQUE4QnRELFFBQTlCO0FBQ0QsYUFWRDs7QUFZQXVOLHNCQUFVZSxLQUFWO0FBQ0QsV0FkRCxPQUF5QkQsY0FBekIsSUF2RUssRUFBUDs7QUF1RkQsS0F6SEQsT0FBaUJsQixlQUFqQixJQXZGZSxFQUFqQiIsImZpbGUiOiJvcmRlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IG1pbmltYXRjaCBmcm9tICdtaW5pbWF0Y2gnO1xuaW1wb3J0IGluY2x1ZGVzIGZyb20gJ2FycmF5LWluY2x1ZGVzJztcbmltcG9ydCBncm91cEJ5IGZyb20gJ29iamVjdC5ncm91cGJ5JztcblxuaW1wb3J0IGltcG9ydFR5cGUgZnJvbSAnLi4vY29yZS9pbXBvcnRUeXBlJztcbmltcG9ydCBpc1N0YXRpY1JlcXVpcmUgZnJvbSAnLi4vY29yZS9zdGF0aWNSZXF1aXJlJztcbmltcG9ydCBkb2NzVXJsIGZyb20gJy4uL2RvY3NVcmwnO1xuXG5jb25zdCBkZWZhdWx0R3JvdXBzID0gWydidWlsdGluJywgJ2V4dGVybmFsJywgJ3BhcmVudCcsICdzaWJsaW5nJywgJ2luZGV4J107XG5cbi8vIFJFUE9SVElORyBBTkQgRklYSU5HXG5cbmZ1bmN0aW9uIHJldmVyc2UoYXJyYXkpIHtcbiAgcmV0dXJuIGFycmF5Lm1hcChmdW5jdGlvbiAodikge1xuICAgIHJldHVybiB7IC4uLnYsIHJhbms6IC12LnJhbmsgfTtcbiAgfSkucmV2ZXJzZSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QWZ0ZXIoY3VycmVudE5vZGVPclRva2VuKTtcbiAgICBpZiAoY3VycmVudE5vZGVPclRva2VuID09IG51bGwpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXN1bHQucHVzaChjdXJyZW50Tm9kZU9yVG9rZW4pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QmVmb3JlKGN1cnJlbnROb2RlT3JUb2tlbik7XG4gICAgaWYgKGN1cnJlbnROb2RlT3JUb2tlbiA9PSBudWxsKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0LnB1c2goY3VycmVudE5vZGVPclRva2VuKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gdGFrZVRva2Vuc0FmdGVyV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNBZnRlcihzb3VyY2VDb2RlLCBub2RlLCAxMDApO1xuICBjb25zdCByZXN1bHQgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiB0YWtlVG9rZW5zQmVmb3JlV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgMTAwKTtcbiAgY29uc3QgcmVzdWx0ID0gW107XG4gIGZvciAobGV0IGkgPSB0b2tlbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gZmluZE91dE9mT3JkZXIoaW1wb3J0ZWQpIHtcbiAgaWYgKGltcG9ydGVkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBsZXQgbWF4U2VlblJhbmtOb2RlID0gaW1wb3J0ZWRbMF07XG4gIHJldHVybiBpbXBvcnRlZC5maWx0ZXIoZnVuY3Rpb24gKGltcG9ydGVkTW9kdWxlKSB7XG4gICAgY29uc3QgcmVzID0gaW1wb3J0ZWRNb2R1bGUucmFuayA8IG1heFNlZW5SYW5rTm9kZS5yYW5rO1xuICAgIGlmIChtYXhTZWVuUmFua05vZGUucmFuayA8IGltcG9ydGVkTW9kdWxlLnJhbmspIHtcbiAgICAgIG1heFNlZW5SYW5rTm9kZSA9IGltcG9ydGVkTW9kdWxlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFJvb3ROb2RlKG5vZGUpIHtcbiAgbGV0IHBhcmVudCA9IG5vZGU7XG4gIHdoaWxlIChwYXJlbnQucGFyZW50ICE9IG51bGwgJiYgcGFyZW50LnBhcmVudC5ib2R5ID09IG51bGwpIHtcbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuICB9XG4gIHJldHVybiBwYXJlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkge1xuICByZXR1cm4gKHRva2VuKSA9PiAodG9rZW4udHlwZSA9PT0gJ0Jsb2NrJyB8fCAgdG9rZW4udHlwZSA9PT0gJ0xpbmUnKVxuICAgICYmIHRva2VuLmxvYy5zdGFydC5saW5lID09PSB0b2tlbi5sb2MuZW5kLmxpbmVcbiAgICAmJiB0b2tlbi5sb2MuZW5kLmxpbmUgPT09IG5vZGUubG9jLmVuZC5saW5lO1xufVxuXG5mdW5jdGlvbiBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIG5vZGUpIHtcbiAgY29uc3QgdG9rZW5zVG9FbmRPZkxpbmUgPSB0YWtlVG9rZW5zQWZ0ZXJXaGlsZShzb3VyY2VDb2RlLCBub2RlLCBjb21tZW50T25TYW1lTGluZUFzKG5vZGUpKTtcbiAgY29uc3QgZW5kT2ZUb2tlbnMgPSB0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggPiAwXG4gICAgPyB0b2tlbnNUb0VuZE9mTGluZVt0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggLSAxXS5yYW5nZVsxXVxuICAgIDogbm9kZS5yYW5nZVsxXTtcbiAgbGV0IHJlc3VsdCA9IGVuZE9mVG9rZW5zO1xuICBmb3IgKGxldCBpID0gZW5kT2ZUb2tlbnM7IGkgPCBzb3VyY2VDb2RlLnRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoc291cmNlQ29kZS50ZXh0W2ldID09PSAnXFxuJykge1xuICAgICAgcmVzdWx0ID0gaSArIDE7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJyAnICYmIHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJ1xcdCcgJiYgc291cmNlQ29kZS50ZXh0W2ldICE9PSAnXFxyJykge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJlc3VsdCA9IGkgKyAxO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBub2RlKSB7XG4gIGNvbnN0IHRva2Vuc1RvRW5kT2ZMaW5lID0gdGFrZVRva2Vuc0JlZm9yZVdoaWxlKHNvdXJjZUNvZGUsIG5vZGUsIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkpO1xuICBjb25zdCBzdGFydE9mVG9rZW5zID0gdG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoID4gMCA/IHRva2Vuc1RvRW5kT2ZMaW5lWzBdLnJhbmdlWzBdIDogbm9kZS5yYW5nZVswXTtcbiAgbGV0IHJlc3VsdCA9IHN0YXJ0T2ZUb2tlbnM7XG4gIGZvciAobGV0IGkgPSBzdGFydE9mVG9rZW5zIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGlmIChzb3VyY2VDb2RlLnRleHRbaV0gIT09ICcgJyAmJiBzb3VyY2VDb2RlLnRleHRbaV0gIT09ICdcXHQnKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0ID0gaTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpc1JlcXVpcmVFeHByZXNzaW9uKGV4cHIpIHtcbiAgcmV0dXJuIGV4cHIgIT0gbnVsbFxuICAgICYmIGV4cHIudHlwZSA9PT0gJ0NhbGxFeHByZXNzaW9uJ1xuICAgICYmIGV4cHIuY2FsbGVlICE9IG51bGxcbiAgICAmJiBleHByLmNhbGxlZS5uYW1lID09PSAncmVxdWlyZSdcbiAgICAmJiBleHByLmFyZ3VtZW50cyAhPSBudWxsXG4gICAgJiYgZXhwci5hcmd1bWVudHMubGVuZ3RoID09PSAxXG4gICAgJiYgZXhwci5hcmd1bWVudHNbMF0udHlwZSA9PT0gJ0xpdGVyYWwnO1xufVxuXG5mdW5jdGlvbiBpc1N1cHBvcnRlZFJlcXVpcmVNb2R1bGUobm9kZSkge1xuICBpZiAobm9kZS50eXBlICE9PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKG5vZGUuZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBkZWNsID0gbm9kZS5kZWNsYXJhdGlvbnNbMF07XG4gIGNvbnN0IGlzUGxhaW5SZXF1aXJlID0gZGVjbC5pZFxuICAgICYmIChkZWNsLmlkLnR5cGUgPT09ICdJZGVudGlmaWVyJyB8fCBkZWNsLmlkLnR5cGUgPT09ICdPYmplY3RQYXR0ZXJuJylcbiAgICAmJiBpc1JlcXVpcmVFeHByZXNzaW9uKGRlY2wuaW5pdCk7XG4gIGNvbnN0IGlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uID0gZGVjbC5pZFxuICAgICYmIChkZWNsLmlkLnR5cGUgPT09ICdJZGVudGlmaWVyJyB8fCBkZWNsLmlkLnR5cGUgPT09ICdPYmplY3RQYXR0ZXJuJylcbiAgICAmJiBkZWNsLmluaXQgIT0gbnVsbFxuICAgICYmIGRlY2wuaW5pdC50eXBlID09PSAnQ2FsbEV4cHJlc3Npb24nXG4gICAgJiYgZGVjbC5pbml0LmNhbGxlZSAhPSBudWxsXG4gICAgJiYgZGVjbC5pbml0LmNhbGxlZS50eXBlID09PSAnTWVtYmVyRXhwcmVzc2lvbidcbiAgICAmJiBpc1JlcXVpcmVFeHByZXNzaW9uKGRlY2wuaW5pdC5jYWxsZWUub2JqZWN0KTtcbiAgcmV0dXJuIGlzUGxhaW5SZXF1aXJlIHx8IGlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBpc1BsYWluSW1wb3J0TW9kdWxlKG5vZGUpIHtcbiAgcmV0dXJuIG5vZGUudHlwZSA9PT0gJ0ltcG9ydERlY2xhcmF0aW9uJyAmJiBub2RlLnNwZWNpZmllcnMgIT0gbnVsbCAmJiBub2RlLnNwZWNpZmllcnMubGVuZ3RoID4gMDtcbn1cblxuZnVuY3Rpb24gaXNQbGFpbkltcG9ydEVxdWFscyhub2RlKSB7XG4gIHJldHVybiBub2RlLnR5cGUgPT09ICdUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uJyAmJiBub2RlLm1vZHVsZVJlZmVyZW5jZS5leHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBjYW5Dcm9zc05vZGVXaGlsZVJlb3JkZXIobm9kZSkge1xuICByZXR1cm4gaXNTdXBwb3J0ZWRSZXF1aXJlTW9kdWxlKG5vZGUpIHx8IGlzUGxhaW5JbXBvcnRNb2R1bGUobm9kZSkgfHwgaXNQbGFpbkltcG9ydEVxdWFscyhub2RlKTtcbn1cblxuZnVuY3Rpb24gY2FuUmVvcmRlckl0ZW1zKGZpcnN0Tm9kZSwgc2Vjb25kTm9kZSkge1xuICBjb25zdCBwYXJlbnQgPSBmaXJzdE5vZGUucGFyZW50O1xuICBjb25zdCBbZmlyc3RJbmRleCwgc2Vjb25kSW5kZXhdID0gW1xuICAgIHBhcmVudC5ib2R5LmluZGV4T2YoZmlyc3ROb2RlKSxcbiAgICBwYXJlbnQuYm9keS5pbmRleE9mKHNlY29uZE5vZGUpLFxuICBdLnNvcnQoKTtcbiAgY29uc3Qgbm9kZXNCZXR3ZWVuID0gcGFyZW50LmJvZHkuc2xpY2UoZmlyc3RJbmRleCwgc2Vjb25kSW5kZXggKyAxKTtcbiAgZm9yIChjb25zdCBub2RlQmV0d2VlbiBvZiBub2Rlc0JldHdlZW4pIHtcbiAgICBpZiAoIWNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlcihub2RlQmV0d2VlbikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG1ha2VJbXBvcnREZXNjcmlwdGlvbihub2RlKSB7XG4gIGlmIChub2RlLm5vZGUuaW1wb3J0S2luZCA9PT0gJ3R5cGUnKSB7XG4gICAgcmV0dXJuICd0eXBlIGltcG9ydCc7XG4gIH1cbiAgaWYgKG5vZGUubm9kZS5pbXBvcnRLaW5kID09PSAndHlwZW9mJykge1xuICAgIHJldHVybiAndHlwZW9mIGltcG9ydCc7XG4gIH1cbiAgcmV0dXJuICdpbXBvcnQnO1xufVxuXG5mdW5jdGlvbiBmaXhPdXRPZk9yZGVyKGNvbnRleHQsIGZpcnN0Tm9kZSwgc2Vjb25kTm9kZSwgb3JkZXIpIHtcbiAgY29uc3Qgc291cmNlQ29kZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpO1xuXG4gIGNvbnN0IGZpcnN0Um9vdCA9IGZpbmRSb290Tm9kZShmaXJzdE5vZGUubm9kZSk7XG4gIGNvbnN0IGZpcnN0Um9vdFN0YXJ0ID0gZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIGZpcnN0Um9vdCk7XG4gIGNvbnN0IGZpcnN0Um9vdEVuZCA9IGZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgZmlyc3RSb290KTtcblxuICBjb25zdCBzZWNvbmRSb290ID0gZmluZFJvb3ROb2RlKHNlY29uZE5vZGUubm9kZSk7XG4gIGNvbnN0IHNlY29uZFJvb3RTdGFydCA9IGZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBzZWNvbmRSb290KTtcbiAgY29uc3Qgc2Vjb25kUm9vdEVuZCA9IGZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgc2Vjb25kUm9vdCk7XG4gIGNvbnN0IGNhbkZpeCA9IGNhblJlb3JkZXJJdGVtcyhmaXJzdFJvb3QsIHNlY29uZFJvb3QpO1xuXG4gIGxldCBuZXdDb2RlID0gc291cmNlQ29kZS50ZXh0LnN1YnN0cmluZyhzZWNvbmRSb290U3RhcnQsIHNlY29uZFJvb3RFbmQpO1xuICBpZiAobmV3Q29kZVtuZXdDb2RlLmxlbmd0aCAtIDFdICE9PSAnXFxuJykge1xuICAgIG5ld0NvZGUgPSBgJHtuZXdDb2RlfVxcbmA7XG4gIH1cblxuICBjb25zdCBmaXJzdEltcG9ydCA9IGAke21ha2VJbXBvcnREZXNjcmlwdGlvbihmaXJzdE5vZGUpfSBvZiBcXGAke2ZpcnN0Tm9kZS5kaXNwbGF5TmFtZX1cXGBgO1xuICBjb25zdCBzZWNvbmRJbXBvcnQgPSBgXFxgJHtzZWNvbmROb2RlLmRpc3BsYXlOYW1lfVxcYCAke21ha2VJbXBvcnREZXNjcmlwdGlvbihzZWNvbmROb2RlKX1gO1xuICBjb25zdCBtZXNzYWdlID0gYCR7c2Vjb25kSW1wb3J0fSBzaG91bGQgb2NjdXIgJHtvcmRlcn0gJHtmaXJzdEltcG9ydH1gO1xuXG4gIGlmIChvcmRlciA9PT0gJ2JlZm9yZScpIHtcbiAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICBub2RlOiBzZWNvbmROb2RlLm5vZGUsXG4gICAgICBtZXNzYWdlLFxuICAgICAgZml4OiBjYW5GaXggJiYgKChmaXhlcikgPT4gZml4ZXIucmVwbGFjZVRleHRSYW5nZShcbiAgICAgICAgW2ZpcnN0Um9vdFN0YXJ0LCBzZWNvbmRSb290RW5kXSxcbiAgICAgICAgbmV3Q29kZSArIHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcoZmlyc3RSb290U3RhcnQsIHNlY29uZFJvb3RTdGFydCksXG4gICAgICApKSxcbiAgICB9KTtcbiAgfSBlbHNlIGlmIChvcmRlciA9PT0gJ2FmdGVyJykge1xuICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgIG5vZGU6IHNlY29uZE5vZGUubm9kZSxcbiAgICAgIG1lc3NhZ2UsXG4gICAgICBmaXg6IGNhbkZpeCAmJiAoKGZpeGVyKSA9PiBmaXhlci5yZXBsYWNlVGV4dFJhbmdlKFxuICAgICAgICBbc2Vjb25kUm9vdFN0YXJ0LCBmaXJzdFJvb3RFbmRdLFxuICAgICAgICBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKHNlY29uZFJvb3RFbmQsIGZpcnN0Um9vdEVuZCkgKyBuZXdDb2RlLFxuICAgICAgKSksXG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVwb3J0T3V0T2ZPcmRlcihjb250ZXh0LCBpbXBvcnRlZCwgb3V0T2ZPcmRlciwgb3JkZXIpIHtcbiAgb3V0T2ZPcmRlci5mb3JFYWNoKGZ1bmN0aW9uIChpbXApIHtcbiAgICBjb25zdCBmb3VuZCA9IGltcG9ydGVkLmZpbmQoZnVuY3Rpb24gaGFzSGlnaGVyUmFuayhpbXBvcnRlZEl0ZW0pIHtcbiAgICAgIHJldHVybiBpbXBvcnRlZEl0ZW0ucmFuayA+IGltcC5yYW5rO1xuICAgIH0pO1xuICAgIGZpeE91dE9mT3JkZXIoY29udGV4dCwgZm91bmQsIGltcCwgb3JkZXIpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gbWFrZU91dE9mT3JkZXJSZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQpIHtcbiAgY29uc3Qgb3V0T2ZPcmRlciA9IGZpbmRPdXRPZk9yZGVyKGltcG9ydGVkKTtcbiAgaWYgKCFvdXRPZk9yZGVyLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZXJlIGFyZSB0aGluZ3MgdG8gcmVwb3J0LiBUcnkgdG8gbWluaW1pemUgdGhlIG51bWJlciBvZiByZXBvcnRlZCBlcnJvcnMuXG4gIGNvbnN0IHJldmVyc2VkSW1wb3J0ZWQgPSByZXZlcnNlKGltcG9ydGVkKTtcbiAgY29uc3QgcmV2ZXJzZWRPcmRlciA9IGZpbmRPdXRPZk9yZGVyKHJldmVyc2VkSW1wb3J0ZWQpO1xuICBpZiAocmV2ZXJzZWRPcmRlci5sZW5ndGggPCBvdXRPZk9yZGVyLmxlbmd0aCkge1xuICAgIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgcmV2ZXJzZWRJbXBvcnRlZCwgcmV2ZXJzZWRPcmRlciwgJ2FmdGVyJyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgaW1wb3J0ZWQsIG91dE9mT3JkZXIsICdiZWZvcmUnKTtcbn1cblxuY29uc3QgY29tcGFyZVN0cmluZyA9IChhLCBiKSA9PiB7XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMTtcbiAgfVxuICBpZiAoYSA+IGIpIHtcbiAgICByZXR1cm4gMTtcbiAgfVxuICByZXR1cm4gMDtcbn07XG5cbi8qKiBTb21lIHBhcnNlcnMgKGxhbmd1YWdlcyB3aXRob3V0IHR5cGVzKSBkb24ndCBwcm92aWRlIEltcG9ydEtpbmQgKi9cbmNvbnN0IERFQUZVTFRfSU1QT1JUX0tJTkQgPSAndmFsdWUnO1xuY29uc3QgZ2V0Tm9ybWFsaXplZFZhbHVlID0gKG5vZGUsIHRvTG93ZXJDYXNlKSA9PiB7XG4gIGNvbnN0IHZhbHVlID0gbm9kZS52YWx1ZTtcbiAgcmV0dXJuIHRvTG93ZXJDYXNlID8gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpIDogdmFsdWU7XG59O1xuXG5mdW5jdGlvbiBnZXRTb3J0ZXIoYWxwaGFiZXRpemVPcHRpb25zKSB7XG4gIGNvbnN0IG11bHRpcGxpZXIgPSBhbHBoYWJldGl6ZU9wdGlvbnMub3JkZXIgPT09ICdhc2MnID8gMSA6IC0xO1xuICBjb25zdCBvcmRlckltcG9ydEtpbmQgPSBhbHBoYWJldGl6ZU9wdGlvbnMub3JkZXJJbXBvcnRLaW5kO1xuICBjb25zdCBtdWx0aXBsaWVySW1wb3J0S2luZCA9IG9yZGVySW1wb3J0S2luZCAhPT0gJ2lnbm9yZSdcbiAgICAmJiAoYWxwaGFiZXRpemVPcHRpb25zLm9yZGVySW1wb3J0S2luZCA9PT0gJ2FzYycgPyAxIDogLTEpO1xuXG4gIHJldHVybiBmdW5jdGlvbiBpbXBvcnRzU29ydGVyKG5vZGVBLCBub2RlQikge1xuICAgIGNvbnN0IGltcG9ydEEgPSBnZXROb3JtYWxpemVkVmFsdWUobm9kZUEsIGFscGhhYmV0aXplT3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUpO1xuICAgIGNvbnN0IGltcG9ydEIgPSBnZXROb3JtYWxpemVkVmFsdWUobm9kZUIsIGFscGhhYmV0aXplT3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUpO1xuICAgIGxldCByZXN1bHQgPSAwO1xuXG4gICAgaWYgKCFpbmNsdWRlcyhpbXBvcnRBLCAnLycpICYmICFpbmNsdWRlcyhpbXBvcnRCLCAnLycpKSB7XG4gICAgICByZXN1bHQgPSBjb21wYXJlU3RyaW5nKGltcG9ydEEsIGltcG9ydEIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBBID0gaW1wb3J0QS5zcGxpdCgnLycpO1xuICAgICAgY29uc3QgQiA9IGltcG9ydEIuc3BsaXQoJy8nKTtcbiAgICAgIGNvbnN0IGEgPSBBLmxlbmd0aDtcbiAgICAgIGNvbnN0IGIgPSBCLmxlbmd0aDtcblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihhLCBiKTsgaSsrKSB7XG4gICAgICAgIHJlc3VsdCA9IGNvbXBhcmVTdHJpbmcoQVtpXSwgQltpXSk7XG4gICAgICAgIGlmIChyZXN1bHQpIHsgYnJlYWs7IH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXN1bHQgJiYgYSAhPT0gYikge1xuICAgICAgICByZXN1bHQgPSBhIDwgYiA/IC0xIDogMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXN1bHQgPSByZXN1bHQgKiBtdWx0aXBsaWVyO1xuXG4gICAgLy8gSW4gY2FzZSB0aGUgcGF0aHMgYXJlIGVxdWFsIChyZXN1bHQgPT09IDApLCBzb3J0IHRoZW0gYnkgaW1wb3J0S2luZFxuICAgIGlmICghcmVzdWx0ICYmIG11bHRpcGxpZXJJbXBvcnRLaW5kKSB7XG4gICAgICByZXN1bHQgPSBtdWx0aXBsaWVySW1wb3J0S2luZCAqIGNvbXBhcmVTdHJpbmcoXG4gICAgICAgIG5vZGVBLm5vZGUuaW1wb3J0S2luZCB8fCBERUFGVUxUX0lNUE9SVF9LSU5ELFxuICAgICAgICBub2RlQi5ub2RlLmltcG9ydEtpbmQgfHwgREVBRlVMVF9JTVBPUlRfS0lORCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cblxuZnVuY3Rpb24gbXV0YXRlUmFua3NUb0FscGhhYmV0aXplKGltcG9ydGVkLCBhbHBoYWJldGl6ZU9wdGlvbnMpIHtcbiAgY29uc3QgZ3JvdXBlZEJ5UmFua3MgPSBncm91cEJ5KGltcG9ydGVkLCAoaXRlbSkgPT4gaXRlbS5yYW5rKTtcblxuICBjb25zdCBzb3J0ZXJGbiA9IGdldFNvcnRlcihhbHBoYWJldGl6ZU9wdGlvbnMpO1xuXG4gIC8vIHNvcnQgZ3JvdXAga2V5cyBzbyB0aGF0IHRoZXkgY2FuIGJlIGl0ZXJhdGVkIG9uIGluIG9yZGVyXG4gIGNvbnN0IGdyb3VwUmFua3MgPSBPYmplY3Qua2V5cyhncm91cGVkQnlSYW5rcykuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIHJldHVybiBhIC0gYjtcbiAgfSk7XG5cbiAgLy8gc29ydCBpbXBvcnRzIGxvY2FsbHkgd2l0aGluIHRoZWlyIGdyb3VwXG4gIGdyb3VwUmFua3MuZm9yRWFjaChmdW5jdGlvbiAoZ3JvdXBSYW5rKSB7XG4gICAgZ3JvdXBlZEJ5UmFua3NbZ3JvdXBSYW5rXS5zb3J0KHNvcnRlckZuKTtcbiAgfSk7XG5cbiAgLy8gYXNzaWduIGdsb2JhbGx5IHVuaXF1ZSByYW5rIHRvIGVhY2ggaW1wb3J0XG4gIGxldCBuZXdSYW5rID0gMDtcbiAgY29uc3QgYWxwaGFiZXRpemVkUmFua3MgPSBncm91cFJhbmtzLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBncm91cFJhbmspIHtcbiAgICBncm91cGVkQnlSYW5rc1tncm91cFJhbmtdLmZvckVhY2goZnVuY3Rpb24gKGltcG9ydGVkSXRlbSkge1xuICAgICAgYWNjW2Ake2ltcG9ydGVkSXRlbS52YWx1ZX18JHtpbXBvcnRlZEl0ZW0ubm9kZS5pbXBvcnRLaW5kfWBdID0gcGFyc2VJbnQoZ3JvdXBSYW5rLCAxMCkgKyBuZXdSYW5rO1xuICAgICAgbmV3UmFuayArPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICAvLyBtdXRhdGUgdGhlIG9yaWdpbmFsIGdyb3VwLXJhbmsgd2l0aCBhbHBoYWJldGl6ZWQtcmFua1xuICBpbXBvcnRlZC5mb3JFYWNoKGZ1bmN0aW9uIChpbXBvcnRlZEl0ZW0pIHtcbiAgICBpbXBvcnRlZEl0ZW0ucmFuayA9IGFscGhhYmV0aXplZFJhbmtzW2Ake2ltcG9ydGVkSXRlbS52YWx1ZX18JHtpbXBvcnRlZEl0ZW0ubm9kZS5pbXBvcnRLaW5kfWBdO1xuICB9KTtcbn1cblxuLy8gREVURUNUSU5HXG5cbmZ1bmN0aW9uIGNvbXB1dGVQYXRoUmFuayhyYW5rcywgcGF0aEdyb3VwcywgcGF0aCwgbWF4UG9zaXRpb24pIHtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBwYXRoR3JvdXBzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGNvbnN0IHsgcGF0dGVybiwgcGF0dGVybk9wdGlvbnMsIHBhdHRlcm5UeXBlLCBncm91cCwgcG9zaXRpb24gPSAxIH0gPSBwYXRoR3JvdXBzW2ldO1xuICAgIHN3aXRjaCAocGF0dGVyblR5cGUpIHtcbiAgICAgIGNhc2UgJ3JlJzpcbiAgICAgICAgaWYgKG5ldyBSZWdFeHAocGF0dGVybiwgcGF0dGVybk9wdGlvbnMpLnRlc3QocGF0aCkpIHtcbiAgICAgICAgICByZXR1cm4gcmFua3NbZ3JvdXBdICsgcG9zaXRpb24gLyBtYXhQb3NpdGlvbjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnZ2xvYic6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobWluaW1hdGNoKHBhdGgsIHBhdHRlcm4sIHBhdHRlcm5PcHRpb25zIHx8IHsgbm9jb21tZW50OiB0cnVlIH0pKSB7XG4gICAgICAgICAgcmV0dXJuIHJhbmtzW2dyb3VwXSArIHBvc2l0aW9uIC8gbWF4UG9zaXRpb247XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSYW5rKGNvbnRleHQsIHJhbmtzLCBpbXBvcnRFbnRyeSwgZXhjbHVkZWRJbXBvcnRUeXBlcykge1xuICBsZXQgaW1wVHlwZTtcbiAgbGV0IHJhbms7XG4gIGlmIChpbXBvcnRFbnRyeS50eXBlID09PSAnaW1wb3J0Om9iamVjdCcpIHtcbiAgICBpbXBUeXBlID0gJ29iamVjdCc7XG4gIH0gZWxzZSBpZiAoaW1wb3J0RW50cnkubm9kZS5pbXBvcnRLaW5kID09PSAndHlwZScgJiYgcmFua3Mub21pdHRlZFR5cGVzLmluZGV4T2YoJ3R5cGUnKSA9PT0gLTEpIHtcbiAgICBpbXBUeXBlID0gJ3R5cGUnO1xuICB9IGVsc2Uge1xuICAgIGltcFR5cGUgPSBpbXBvcnRUeXBlKGltcG9ydEVudHJ5LnZhbHVlLCBjb250ZXh0KTtcbiAgfVxuICBpZiAoIWV4Y2x1ZGVkSW1wb3J0VHlwZXMuaGFzKGltcFR5cGUpKSB7XG4gICAgcmFuayA9IGNvbXB1dGVQYXRoUmFuayhyYW5rcy5ncm91cHMsIHJhbmtzLnBhdGhHcm91cHMsIGltcG9ydEVudHJ5LnZhbHVlLCByYW5rcy5tYXhQb3NpdGlvbik7XG4gIH1cbiAgaWYgKHR5cGVvZiByYW5rID09PSAndW5kZWZpbmVkJykge1xuICAgIHJhbmsgPSByYW5rcy5ncm91cHNbaW1wVHlwZV07XG4gIH1cbiAgaWYgKGltcG9ydEVudHJ5LnR5cGUgIT09ICdpbXBvcnQnICYmICFpbXBvcnRFbnRyeS50eXBlLnN0YXJ0c1dpdGgoJ2ltcG9ydDonKSkge1xuICAgIHJhbmsgKz0gMTAwO1xuICB9XG5cbiAgcmV0dXJuIHJhbms7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyTm9kZShjb250ZXh0LCBpbXBvcnRFbnRyeSwgcmFua3MsIGltcG9ydGVkLCBleGNsdWRlZEltcG9ydFR5cGVzKSB7XG4gIGNvbnN0IHJhbmsgPSBjb21wdXRlUmFuayhjb250ZXh0LCByYW5rcywgaW1wb3J0RW50cnksIGV4Y2x1ZGVkSW1wb3J0VHlwZXMpO1xuICBpZiAocmFuayAhPT0gLTEpIHtcbiAgICBpbXBvcnRlZC5wdXNoKHsgLi4uaW1wb3J0RW50cnksIHJhbmsgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZUJsb2NrKG5vZGUpIHtcbiAgbGV0IG4gPSBub2RlO1xuICAvLyBIYW5kbGUgY2FzZXMgbGlrZSBgY29uc3QgYmF6ID0gcmVxdWlyZSgnZm9vJykuYmFyLmJhemBcbiAgLy8gYW5kIGBjb25zdCBmb28gPSByZXF1aXJlKCdmb28nKSgpYFxuICB3aGlsZSAoXG4gICAgbi5wYXJlbnQudHlwZSA9PT0gJ01lbWJlckV4cHJlc3Npb24nICYmIG4ucGFyZW50Lm9iamVjdCA9PT0gblxuICAgIHx8IG4ucGFyZW50LnR5cGUgPT09ICdDYWxsRXhwcmVzc2lvbicgJiYgbi5wYXJlbnQuY2FsbGVlID09PSBuXG4gICkge1xuICAgIG4gPSBuLnBhcmVudDtcbiAgfVxuICBpZiAoXG4gICAgbi5wYXJlbnQudHlwZSA9PT0gJ1ZhcmlhYmxlRGVjbGFyYXRvcidcbiAgICAmJiBuLnBhcmVudC5wYXJlbnQudHlwZSA9PT0gJ1ZhcmlhYmxlRGVjbGFyYXRpb24nXG4gICAgJiYgbi5wYXJlbnQucGFyZW50LnBhcmVudC50eXBlID09PSAnUHJvZ3JhbSdcbiAgKSB7XG4gICAgcmV0dXJuIG4ucGFyZW50LnBhcmVudC5wYXJlbnQ7XG4gIH1cbn1cblxuY29uc3QgdHlwZXMgPSBbJ2J1aWx0aW4nLCAnZXh0ZXJuYWwnLCAnaW50ZXJuYWwnLCAndW5rbm93bicsICdwYXJlbnQnLCAnc2libGluZycsICdpbmRleCcsICdvYmplY3QnLCAndHlwZSddO1xuXG4vLyBDcmVhdGVzIGFuIG9iamVjdCB3aXRoIHR5cGUtcmFuayBwYWlycy5cbi8vIEV4YW1wbGU6IHsgaW5kZXg6IDAsIHNpYmxpbmc6IDEsIHBhcmVudDogMSwgZXh0ZXJuYWw6IDEsIGJ1aWx0aW46IDIsIGludGVybmFsOiAyIH1cbi8vIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgaXQgY29udGFpbnMgYSB0eXBlIHRoYXQgZG9lcyBub3QgZXhpc3QsIG9yIGhhcyBhIGR1cGxpY2F0ZVxuZnVuY3Rpb24gY29udmVydEdyb3Vwc1RvUmFua3MoZ3JvdXBzKSB7XG4gIGNvbnN0IHJhbmtPYmplY3QgPSBncm91cHMucmVkdWNlKGZ1bmN0aW9uIChyZXMsIGdyb3VwLCBpbmRleCkge1xuICAgIFtdLmNvbmNhdChncm91cCkuZm9yRWFjaChmdW5jdGlvbiAoZ3JvdXBJdGVtKSB7XG4gICAgICBpZiAodHlwZXMuaW5kZXhPZihncm91cEl0ZW0uc3BsaXQoJzonKVswXSkgPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW5jb3JyZWN0IGNvbmZpZ3VyYXRpb24gb2YgdGhlIHJ1bGU6IFVua25vd24gdHlwZSBcXGAke0pTT04uc3RyaW5naWZ5KGdyb3VwSXRlbSl9XFxgYCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzW2dyb3VwSXRlbV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEluY29ycmVjdCBjb25maWd1cmF0aW9uIG9mIHRoZSBydWxlOiBcXGAke2dyb3VwSXRlbX1cXGAgaXMgZHVwbGljYXRlZGApO1xuICAgICAgfVxuICAgICAgcmVzW2dyb3VwSXRlbV0gPSBpbmRleCAqIDI7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlcztcbiAgfSwge30pO1xuXG4gIGNvbnN0IG9taXR0ZWRUeXBlcyA9IHR5cGVzLmZpbHRlcihmdW5jdGlvbiAodHlwZSkge1xuICAgIHJldHVybiB0eXBlb2YgcmFua09iamVjdFt0eXBlXSA9PT0gJ3VuZGVmaW5lZCc7XG4gIH0pO1xuXG4gIGNvbnN0IHJhbmtzID0gb21pdHRlZFR5cGVzLnJlZHVjZShmdW5jdGlvbiAocmVzLCB0eXBlKSB7XG4gICAgcmVzW3R5cGVdID0gZ3JvdXBzLmxlbmd0aCAqIDI7XG4gICAgcmV0dXJuIHJlcztcbiAgfSwgcmFua09iamVjdCk7XG5cbiAgcmV0dXJuIHsgZ3JvdXBzOiByYW5rcywgb21pdHRlZFR5cGVzIH07XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQYXRoR3JvdXBzRm9yUmFua3MocGF0aEdyb3Vwcykge1xuICBjb25zdCBhZnRlciA9IHt9O1xuICBjb25zdCBiZWZvcmUgPSB7fTtcblxuICBjb25zdCB0cmFuc2Zvcm1lZCA9IHBhdGhHcm91cHMubWFwKChwYXRoR3JvdXAsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgeyBncm91cCwgcG9zaXRpb246IHBvc2l0aW9uU3RyaW5nIH0gPSBwYXRoR3JvdXA7XG4gICAgbGV0IHBvc2l0aW9uID0gMDtcbiAgICBpZiAocG9zaXRpb25TdHJpbmcgPT09ICdhZnRlcicpIHtcbiAgICAgIGlmICghYWZ0ZXJbZ3JvdXBdKSB7XG4gICAgICAgIGFmdGVyW2dyb3VwXSA9IDE7XG4gICAgICB9XG4gICAgICBwb3NpdGlvbiA9IGFmdGVyW2dyb3VwXSsrO1xuICAgIH0gZWxzZSBpZiAocG9zaXRpb25TdHJpbmcgPT09ICdiZWZvcmUnKSB7XG4gICAgICBpZiAoIWJlZm9yZVtncm91cF0pIHtcbiAgICAgICAgYmVmb3JlW2dyb3VwXSA9IFtdO1xuICAgICAgfVxuICAgICAgYmVmb3JlW2dyb3VwXS5wdXNoKGluZGV4KTtcbiAgICB9XG5cbiAgICByZXR1cm4geyAuLi5wYXRoR3JvdXAsIHBvc2l0aW9uIH07XG4gIH0pO1xuXG4gIGxldCBtYXhQb3NpdGlvbiA9IDE7XG5cbiAgT2JqZWN0LmtleXMoYmVmb3JlKS5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGdyb3VwTGVuZ3RoID0gYmVmb3JlW2dyb3VwXS5sZW5ndGg7XG4gICAgYmVmb3JlW2dyb3VwXS5mb3JFYWNoKChncm91cEluZGV4LCBpbmRleCkgPT4ge1xuICAgICAgdHJhbnNmb3JtZWRbZ3JvdXBJbmRleF0ucG9zaXRpb24gPSAtMSAqIChncm91cExlbmd0aCAtIGluZGV4KTtcbiAgICB9KTtcbiAgICBtYXhQb3NpdGlvbiA9IE1hdGgubWF4KG1heFBvc2l0aW9uLCBncm91cExlbmd0aCk7XG4gIH0pO1xuXG4gIE9iamVjdC5rZXlzKGFmdGVyKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBjb25zdCBncm91cE5leHRQb3NpdGlvbiA9IGFmdGVyW2tleV07XG4gICAgbWF4UG9zaXRpb24gPSBNYXRoLm1heChtYXhQb3NpdGlvbiwgZ3JvdXBOZXh0UG9zaXRpb24gLSAxKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoR3JvdXBzOiB0cmFuc2Zvcm1lZCxcbiAgICBtYXhQb3NpdGlvbjogbWF4UG9zaXRpb24gPiAxMCA/IE1hdGgucG93KDEwLCBNYXRoLmNlaWwoTWF0aC5sb2cxMChtYXhQb3NpdGlvbikpKSA6IDEwLFxuICB9O1xufVxuXG5mdW5jdGlvbiBmaXhOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgcHJldmlvdXNJbXBvcnQpIHtcbiAgY29uc3QgcHJldlJvb3QgPSBmaW5kUm9vdE5vZGUocHJldmlvdXNJbXBvcnQubm9kZSk7XG4gIGNvbnN0IHRva2Vuc1RvRW5kT2ZMaW5lID0gdGFrZVRva2Vuc0FmdGVyV2hpbGUoXG4gICAgY29udGV4dC5nZXRTb3VyY2VDb2RlKCksIHByZXZSb290LCBjb21tZW50T25TYW1lTGluZUFzKHByZXZSb290KSk7XG5cbiAgbGV0IGVuZE9mTGluZSA9IHByZXZSb290LnJhbmdlWzFdO1xuICBpZiAodG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoID4gMCkge1xuICAgIGVuZE9mTGluZSA9IHRva2Vuc1RvRW5kT2ZMaW5lW3Rva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCAtIDFdLnJhbmdlWzFdO1xuICB9XG4gIHJldHVybiAoZml4ZXIpID0+IGZpeGVyLmluc2VydFRleHRBZnRlclJhbmdlKFtwcmV2Um9vdC5yYW5nZVswXSwgZW5kT2ZMaW5lXSwgJ1xcbicpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpIHtcbiAgY29uc3Qgc291cmNlQ29kZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpO1xuICBjb25zdCBwcmV2Um9vdCA9IGZpbmRSb290Tm9kZShwcmV2aW91c0ltcG9ydC5ub2RlKTtcbiAgY29uc3QgY3VyclJvb3QgPSBmaW5kUm9vdE5vZGUoY3VycmVudEltcG9ydC5ub2RlKTtcbiAgY29uc3QgcmFuZ2VUb1JlbW92ZSA9IFtcbiAgICBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHByZXZSb290KSxcbiAgICBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgY3VyclJvb3QpLFxuICBdO1xuICBpZiAoKC9eXFxzKiQvKS50ZXN0KHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcocmFuZ2VUb1JlbW92ZVswXSwgcmFuZ2VUb1JlbW92ZVsxXSkpKSB7XG4gICAgcmV0dXJuIChmaXhlcikgPT4gZml4ZXIucmVtb3ZlUmFuZ2UocmFuZ2VUb1JlbW92ZSk7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydChjb250ZXh0LCBpbXBvcnRlZCwgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cywgZGlzdGluY3RHcm91cCkge1xuICBjb25zdCBnZXROdW1iZXJPZkVtcHR5TGluZXNCZXR3ZWVuID0gKGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSA9PiB7XG4gICAgY29uc3QgbGluZXNCZXR3ZWVuSW1wb3J0cyA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpLmxpbmVzLnNsaWNlKFxuICAgICAgcHJldmlvdXNJbXBvcnQubm9kZS5sb2MuZW5kLmxpbmUsXG4gICAgICBjdXJyZW50SW1wb3J0Lm5vZGUubG9jLnN0YXJ0LmxpbmUgLSAxLFxuICAgICk7XG5cbiAgICByZXR1cm4gbGluZXNCZXR3ZWVuSW1wb3J0cy5maWx0ZXIoKGxpbmUpID0+ICFsaW5lLnRyaW0oKS5sZW5ndGgpLmxlbmd0aDtcbiAgfTtcbiAgY29uc3QgZ2V0SXNTdGFydE9mRGlzdGluY3RHcm91cCA9IChjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCkgPT4gY3VycmVudEltcG9ydC5yYW5rIC0gMSA+PSBwcmV2aW91c0ltcG9ydC5yYW5rO1xuICBsZXQgcHJldmlvdXNJbXBvcnQgPSBpbXBvcnRlZFswXTtcblxuICBpbXBvcnRlZC5zbGljZSgxKS5mb3JFYWNoKGZ1bmN0aW9uIChjdXJyZW50SW1wb3J0KSB7XG4gICAgY29uc3QgZW1wdHlMaW5lc0JldHdlZW4gPSBnZXROdW1iZXJPZkVtcHR5TGluZXNCZXR3ZWVuKGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KTtcbiAgICBjb25zdCBpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwID0gZ2V0SXNTdGFydE9mRGlzdGluY3RHcm91cChjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCk7XG5cbiAgICBpZiAobmV3bGluZXNCZXR3ZWVuSW1wb3J0cyA9PT0gJ2Fsd2F5cydcbiAgICAgIHx8IG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgPT09ICdhbHdheXMtYW5kLWluc2lkZS1ncm91cHMnKSB7XG4gICAgICBpZiAoY3VycmVudEltcG9ydC5yYW5rICE9PSBwcmV2aW91c0ltcG9ydC5yYW5rICYmIGVtcHR5TGluZXNCZXR3ZWVuID09PSAwKSB7XG4gICAgICAgIGlmIChkaXN0aW5jdEdyb3VwIHx8ICFkaXN0aW5jdEdyb3VwICYmIGlzU3RhcnRPZkRpc3RpbmN0R3JvdXApIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgICAgICBub2RlOiBwcmV2aW91c0ltcG9ydC5ub2RlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1RoZXJlIHNob3VsZCBiZSBhdCBsZWFzdCBvbmUgZW1wdHkgbGluZSBiZXR3ZWVuIGltcG9ydCBncm91cHMnLFxuICAgICAgICAgICAgZml4OiBmaXhOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgcHJldmlvdXNJbXBvcnQpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGVtcHR5TGluZXNCZXR3ZWVuID4gMFxuICAgICAgICAmJiBuZXdsaW5lc0JldHdlZW5JbXBvcnRzICE9PSAnYWx3YXlzLWFuZC1pbnNpZGUtZ3JvdXBzJykge1xuICAgICAgICBpZiAoZGlzdGluY3RHcm91cCAmJiBjdXJyZW50SW1wb3J0LnJhbmsgPT09IHByZXZpb3VzSW1wb3J0LnJhbmsgfHwgIWRpc3RpbmN0R3JvdXAgJiYgIWlzU3RhcnRPZkRpc3RpbmN0R3JvdXApIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgICAgICBub2RlOiBwcmV2aW91c0ltcG9ydC5ub2RlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1RoZXJlIHNob3VsZCBiZSBubyBlbXB0eSBsaW5lIHdpdGhpbiBpbXBvcnQgZ3JvdXAnLFxuICAgICAgICAgICAgZml4OiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbXB0eUxpbmVzQmV0d2VlbiA+IDApIHtcbiAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgbm9kZTogcHJldmlvdXNJbXBvcnQubm9kZSxcbiAgICAgICAgbWVzc2FnZTogJ1RoZXJlIHNob3VsZCBiZSBubyBlbXB0eSBsaW5lIGJldHdlZW4gaW1wb3J0IGdyb3VwcycsXG4gICAgICAgIGZpeDogcmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHByZXZpb3VzSW1wb3J0ID0gY3VycmVudEltcG9ydDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldEFscGhhYmV0aXplQ29uZmlnKG9wdGlvbnMpIHtcbiAgY29uc3QgYWxwaGFiZXRpemUgPSBvcHRpb25zLmFscGhhYmV0aXplIHx8IHt9O1xuICBjb25zdCBvcmRlciA9IGFscGhhYmV0aXplLm9yZGVyIHx8ICdpZ25vcmUnO1xuICBjb25zdCBvcmRlckltcG9ydEtpbmQgPSBhbHBoYWJldGl6ZS5vcmRlckltcG9ydEtpbmQgfHwgJ2lnbm9yZSc7XG4gIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZSA9IGFscGhhYmV0aXplLmNhc2VJbnNlbnNpdGl2ZSB8fCBmYWxzZTtcblxuICByZXR1cm4geyBvcmRlciwgb3JkZXJJbXBvcnRLaW5kLCBjYXNlSW5zZW5zaXRpdmUgfTtcbn1cblxuLy8gVE9ETywgc2VtdmVyLW1ham9yOiBDaGFuZ2UgdGhlIGRlZmF1bHQgb2YgXCJkaXN0aW5jdEdyb3VwXCIgZnJvbSB0cnVlIHRvIGZhbHNlXG5jb25zdCBkZWZhdWx0RGlzdGluY3RHcm91cCA9IHRydWU7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtZXRhOiB7XG4gICAgdHlwZTogJ3N1Z2dlc3Rpb24nLFxuICAgIGRvY3M6IHtcbiAgICAgIGNhdGVnb3J5OiAnU3R5bGUgZ3VpZGUnLFxuICAgICAgZGVzY3JpcHRpb246ICdFbmZvcmNlIGEgY29udmVudGlvbiBpbiBtb2R1bGUgaW1wb3J0IG9yZGVyLicsXG4gICAgICB1cmw6IGRvY3NVcmwoJ29yZGVyJyksXG4gICAgfSxcblxuICAgIGZpeGFibGU6ICdjb2RlJyxcbiAgICBzY2hlbWE6IFtcbiAgICAgIHtcbiAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICBncm91cHM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlczoge1xuICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRpc3RpbmN0R3JvdXA6IHtcbiAgICAgICAgICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICAgICAgICAgIGRlZmF1bHQ6IGRlZmF1bHREaXN0aW5jdEdyb3VwLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcGF0aEdyb3Vwczoge1xuICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXR0ZXJuT3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXR0ZXJuVHlwZToge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICBlbnVtOiBbJ3JlJywgJ2dsb2InXSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdyb3VwOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgIGVudW06IFsnYWZ0ZXInLCAnYmVmb3JlJ10sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgICAgICAgICByZXF1aXJlZDogWydwYXR0ZXJuJywgJ2dyb3VwJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ25ld2xpbmVzLWJldHdlZW4nOiB7XG4gICAgICAgICAgICBlbnVtOiBbXG4gICAgICAgICAgICAgICdpZ25vcmUnLFxuICAgICAgICAgICAgICAnYWx3YXlzJyxcbiAgICAgICAgICAgICAgJ2Fsd2F5cy1hbmQtaW5zaWRlLWdyb3VwcycsXG4gICAgICAgICAgICAgICduZXZlcicsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWxwaGFiZXRpemU6IHtcbiAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG9yZGVyOiB7XG4gICAgICAgICAgICAgICAgZW51bTogWydpZ25vcmUnLCAnYXNjJywgJ2Rlc2MnXSxcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiAnaWdub3JlJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgb3JkZXJJbXBvcnRLaW5kOiB7XG4gICAgICAgICAgICAgICAgZW51bTogWydpZ25vcmUnLCAnYXNjJywgJ2Rlc2MnXSxcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiAnaWdub3JlJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB3YXJuT25VbmFzc2lnbmVkSW1wb3J0czoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgfSxcbiAgICBdLFxuICB9LFxuXG4gIGNyZWF0ZTogZnVuY3Rpb24gaW1wb3J0T3JkZXJSdWxlKGNvbnRleHQpIHtcbiAgICBjb25zdCBvcHRpb25zID0gY29udGV4dC5vcHRpb25zWzBdIHx8IHt9O1xuICAgIGNvbnN0IG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgPSBvcHRpb25zWyduZXdsaW5lcy1iZXR3ZWVuJ10gfHwgJ2lnbm9yZSc7XG4gICAgY29uc3QgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMgPSBuZXcgU2V0KG9wdGlvbnMucGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMgfHwgWydidWlsdGluJywgJ2V4dGVybmFsJywgJ29iamVjdCddKTtcbiAgICBjb25zdCBhbHBoYWJldGl6ZSA9IGdldEFscGhhYmV0aXplQ29uZmlnKG9wdGlvbnMpO1xuICAgIGNvbnN0IGRpc3RpbmN0R3JvdXAgPSBvcHRpb25zLmRpc3RpbmN0R3JvdXAgPT0gbnVsbCA/IGRlZmF1bHREaXN0aW5jdEdyb3VwIDogISFvcHRpb25zLmRpc3RpbmN0R3JvdXA7XG4gICAgbGV0IHJhbmtzO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcGF0aEdyb3VwcywgbWF4UG9zaXRpb24gfSA9IGNvbnZlcnRQYXRoR3JvdXBzRm9yUmFua3Mob3B0aW9ucy5wYXRoR3JvdXBzIHx8IFtdKTtcbiAgICAgIGNvbnN0IHsgZ3JvdXBzLCBvbWl0dGVkVHlwZXMgfSA9IGNvbnZlcnRHcm91cHNUb1JhbmtzKG9wdGlvbnMuZ3JvdXBzIHx8IGRlZmF1bHRHcm91cHMpO1xuICAgICAgcmFua3MgPSB7XG4gICAgICAgIGdyb3VwcyxcbiAgICAgICAgb21pdHRlZFR5cGVzLFxuICAgICAgICBwYXRoR3JvdXBzLFxuICAgICAgICBtYXhQb3NpdGlvbixcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIE1hbGZvcm1lZCBjb25maWd1cmF0aW9uXG4gICAgICByZXR1cm4ge1xuICAgICAgICBQcm9ncmFtKG5vZGUpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydChub2RlLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IGltcG9ydE1hcCA9IG5ldyBNYXAoKTtcblxuICAgIGZ1bmN0aW9uIGdldEJsb2NrSW1wb3J0cyhub2RlKSB7XG4gICAgICBpZiAoIWltcG9ydE1hcC5oYXMobm9kZSkpIHtcbiAgICAgICAgaW1wb3J0TWFwLnNldChub2RlLCBbXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaW1wb3J0TWFwLmdldChub2RlKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgSW1wb3J0RGVjbGFyYXRpb246IGZ1bmN0aW9uIGhhbmRsZUltcG9ydHMobm9kZSkge1xuICAgICAgICAvLyBJZ25vcmluZyB1bmFzc2lnbmVkIGltcG9ydHMgdW5sZXNzIHdhcm5PblVuYXNzaWduZWRJbXBvcnRzIGlzIHNldFxuICAgICAgICBpZiAobm9kZS5zcGVjaWZpZXJzLmxlbmd0aCB8fCBvcHRpb25zLndhcm5PblVuYXNzaWduZWRJbXBvcnRzKSB7XG4gICAgICAgICAgY29uc3QgbmFtZSA9IG5vZGUuc291cmNlLnZhbHVlO1xuICAgICAgICAgIHJlZ2lzdGVyTm9kZShcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgIHZhbHVlOiBuYW1lLFxuICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgdHlwZTogJ2ltcG9ydCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmFua3MsXG4gICAgICAgICAgICBnZXRCbG9ja0ltcG9ydHMobm9kZS5wYXJlbnQpLFxuICAgICAgICAgICAgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFRTSW1wb3J0RXF1YWxzRGVjbGFyYXRpb246IGZ1bmN0aW9uIGhhbmRsZUltcG9ydHMobm9kZSkge1xuICAgICAgICBsZXQgZGlzcGxheU5hbWU7XG4gICAgICAgIGxldCB2YWx1ZTtcbiAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgIC8vIHNraXAgXCJleHBvcnQgaW1wb3J0XCJzXG4gICAgICAgIGlmIChub2RlLmlzRXhwb3J0KSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub2RlLm1vZHVsZVJlZmVyZW5jZS50eXBlID09PSAnVFNFeHRlcm5hbE1vZHVsZVJlZmVyZW5jZScpIHtcbiAgICAgICAgICB2YWx1ZSA9IG5vZGUubW9kdWxlUmVmZXJlbmNlLmV4cHJlc3Npb24udmFsdWU7XG4gICAgICAgICAgZGlzcGxheU5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICB0eXBlID0gJ2ltcG9ydCc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWUgPSAnJztcbiAgICAgICAgICBkaXNwbGF5TmFtZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpLmdldFRleHQobm9kZS5tb2R1bGVSZWZlcmVuY2UpO1xuICAgICAgICAgIHR5cGUgPSAnaW1wb3J0Om9iamVjdCc7XG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJOb2RlKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAge1xuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgZGlzcGxheU5hbWUsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmFua3MsXG4gICAgICAgICAgZ2V0QmxvY2tJbXBvcnRzKG5vZGUucGFyZW50KSxcbiAgICAgICAgICBwYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlcyxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgICBDYWxsRXhwcmVzc2lvbjogZnVuY3Rpb24gaGFuZGxlUmVxdWlyZXMobm9kZSkge1xuICAgICAgICBpZiAoIWlzU3RhdGljUmVxdWlyZShub2RlKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBibG9jayA9IGdldFJlcXVpcmVCbG9jayhub2RlKTtcbiAgICAgICAgaWYgKCFibG9jaykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBuYW1lID0gbm9kZS5hcmd1bWVudHNbMF0udmFsdWU7XG4gICAgICAgIHJlZ2lzdGVyTm9kZShcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICB2YWx1ZTogbmFtZSxcbiAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBuYW1lLFxuICAgICAgICAgICAgdHlwZTogJ3JlcXVpcmUnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmFua3MsXG4gICAgICAgICAgZ2V0QmxvY2tJbXBvcnRzKGJsb2NrKSxcbiAgICAgICAgICBwYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlcyxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgICAnUHJvZ3JhbTpleGl0JzogZnVuY3Rpb24gcmVwb3J0QW5kUmVzZXQoKSB7XG4gICAgICAgIGltcG9ydE1hcC5mb3JFYWNoKChpbXBvcnRlZCkgPT4ge1xuICAgICAgICAgIGlmIChuZXdsaW5lc0JldHdlZW5JbXBvcnRzICE9PSAnaWdub3JlJykge1xuICAgICAgICAgICAgbWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydChjb250ZXh0LCBpbXBvcnRlZCwgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cywgZGlzdGluY3RHcm91cCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGFscGhhYmV0aXplLm9yZGVyICE9PSAnaWdub3JlJykge1xuICAgICAgICAgICAgbXV0YXRlUmFua3NUb0FscGhhYmV0aXplKGltcG9ydGVkLCBhbHBoYWJldGl6ZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbWFrZU91dE9mT3JkZXJSZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpbXBvcnRNYXAuY2xlYXIoKTtcbiAgICAgIH0sXG4gICAgfTtcbiAgfSxcbn07XG4iXX0=