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
      if (types.indexOf(groupItem) === -1) {
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
                'enum': ['re', 'glob'],
                'default': 'glob' },

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9vcmRlci5qcyJdLCJuYW1lcyI6WyJkZWZhdWx0R3JvdXBzIiwicmV2ZXJzZSIsImFycmF5IiwibWFwIiwidiIsInJhbmsiLCJnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIiLCJzb3VyY2VDb2RlIiwibm9kZSIsImNvdW50IiwiY3VycmVudE5vZGVPclRva2VuIiwicmVzdWx0IiwiaSIsImdldFRva2VuT3JDb21tZW50QWZ0ZXIiLCJwdXNoIiwiZ2V0VG9rZW5zT3JDb21tZW50c0JlZm9yZSIsImdldFRva2VuT3JDb21tZW50QmVmb3JlIiwidGFrZVRva2Vuc0FmdGVyV2hpbGUiLCJjb25kaXRpb24iLCJ0b2tlbnMiLCJsZW5ndGgiLCJ0YWtlVG9rZW5zQmVmb3JlV2hpbGUiLCJmaW5kT3V0T2ZPcmRlciIsImltcG9ydGVkIiwibWF4U2VlblJhbmtOb2RlIiwiZmlsdGVyIiwiaW1wb3J0ZWRNb2R1bGUiLCJyZXMiLCJmaW5kUm9vdE5vZGUiLCJwYXJlbnQiLCJib2R5IiwiY29tbWVudE9uU2FtZUxpbmVBcyIsInRva2VuIiwidHlwZSIsImxvYyIsInN0YXJ0IiwibGluZSIsImVuZCIsImZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMiLCJ0b2tlbnNUb0VuZE9mTGluZSIsImVuZE9mVG9rZW5zIiwicmFuZ2UiLCJ0ZXh0IiwiZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzIiwic3RhcnRPZlRva2VucyIsImlzUmVxdWlyZUV4cHJlc3Npb24iLCJleHByIiwiY2FsbGVlIiwibmFtZSIsImFyZ3VtZW50cyIsImlzU3VwcG9ydGVkUmVxdWlyZU1vZHVsZSIsImRlY2xhcmF0aW9ucyIsImRlY2wiLCJpc1BsYWluUmVxdWlyZSIsImlkIiwiaW5pdCIsImlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uIiwib2JqZWN0IiwiaXNQbGFpbkltcG9ydE1vZHVsZSIsInNwZWNpZmllcnMiLCJpc1BsYWluSW1wb3J0RXF1YWxzIiwibW9kdWxlUmVmZXJlbmNlIiwiZXhwcmVzc2lvbiIsImNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlciIsImNhblJlb3JkZXJJdGVtcyIsImZpcnN0Tm9kZSIsInNlY29uZE5vZGUiLCJpbmRleE9mIiwic29ydCIsImZpcnN0SW5kZXgiLCJzZWNvbmRJbmRleCIsIm5vZGVzQmV0d2VlbiIsInNsaWNlIiwibm9kZUJldHdlZW4iLCJtYWtlSW1wb3J0RGVzY3JpcHRpb24iLCJpbXBvcnRLaW5kIiwiZml4T3V0T2ZPcmRlciIsImNvbnRleHQiLCJvcmRlciIsImdldFNvdXJjZUNvZGUiLCJmaXJzdFJvb3QiLCJmaXJzdFJvb3RTdGFydCIsImZpcnN0Um9vdEVuZCIsInNlY29uZFJvb3QiLCJzZWNvbmRSb290U3RhcnQiLCJzZWNvbmRSb290RW5kIiwiY2FuRml4IiwibmV3Q29kZSIsInN1YnN0cmluZyIsImZpcnN0SW1wb3J0IiwiZGlzcGxheU5hbWUiLCJzZWNvbmRJbXBvcnQiLCJtZXNzYWdlIiwicmVwb3J0IiwiZml4IiwiZml4ZXIiLCJyZXBsYWNlVGV4dFJhbmdlIiwicmVwb3J0T3V0T2ZPcmRlciIsIm91dE9mT3JkZXIiLCJmb3JFYWNoIiwiaW1wIiwiZm91bmQiLCJmaW5kIiwiaGFzSGlnaGVyUmFuayIsImltcG9ydGVkSXRlbSIsIm1ha2VPdXRPZk9yZGVyUmVwb3J0IiwicmV2ZXJzZWRJbXBvcnRlZCIsInJldmVyc2VkT3JkZXIiLCJjb21wYXJlU3RyaW5nIiwiYSIsImIiLCJERUFGVUxUX0lNUE9SVF9LSU5EIiwiZ2V0Tm9ybWFsaXplZFZhbHVlIiwidG9Mb3dlckNhc2UiLCJ2YWx1ZSIsIlN0cmluZyIsImdldFNvcnRlciIsImFscGhhYmV0aXplT3B0aW9ucyIsIm11bHRpcGxpZXIiLCJvcmRlckltcG9ydEtpbmQiLCJtdWx0aXBsaWVySW1wb3J0S2luZCIsImltcG9ydHNTb3J0ZXIiLCJub2RlQSIsIm5vZGVCIiwiaW1wb3J0QSIsImNhc2VJbnNlbnNpdGl2ZSIsImltcG9ydEIiLCJBIiwic3BsaXQiLCJCIiwiTWF0aCIsIm1pbiIsIm11dGF0ZVJhbmtzVG9BbHBoYWJldGl6ZSIsImdyb3VwZWRCeVJhbmtzIiwiaXRlbSIsInNvcnRlckZuIiwiZ3JvdXBSYW5rcyIsIk9iamVjdCIsImtleXMiLCJncm91cFJhbmsiLCJuZXdSYW5rIiwiYWxwaGFiZXRpemVkUmFua3MiLCJyZWR1Y2UiLCJhY2MiLCJwYXJzZUludCIsImNvbXB1dGVQYXRoUmFuayIsInJhbmtzIiwicGF0aEdyb3VwcyIsInBhdGgiLCJtYXhQb3NpdGlvbiIsImwiLCJwYXR0ZXJuIiwicGF0dGVybk9wdGlvbnMiLCJwYXR0ZXJuVHlwZSIsImdyb3VwIiwicG9zaXRpb24iLCJSZWdFeHAiLCJ0ZXN0Iiwibm9jb21tZW50IiwiY29tcHV0ZVJhbmsiLCJpbXBvcnRFbnRyeSIsImV4Y2x1ZGVkSW1wb3J0VHlwZXMiLCJpbXBUeXBlIiwib21pdHRlZFR5cGVzIiwiaGFzIiwiZ3JvdXBzIiwic3RhcnRzV2l0aCIsInJlZ2lzdGVyTm9kZSIsImdldFJlcXVpcmVCbG9jayIsIm4iLCJ0eXBlcyIsImNvbnZlcnRHcm91cHNUb1JhbmtzIiwicmFua09iamVjdCIsImluZGV4IiwiY29uY2F0IiwiZ3JvdXBJdGVtIiwiRXJyb3IiLCJKU09OIiwic3RyaW5naWZ5IiwidW5kZWZpbmVkIiwiY29udmVydFBhdGhHcm91cHNGb3JSYW5rcyIsImFmdGVyIiwiYmVmb3JlIiwidHJhbnNmb3JtZWQiLCJwYXRoR3JvdXAiLCJwb3NpdGlvblN0cmluZyIsImdyb3VwTGVuZ3RoIiwiZ3JvdXBJbmRleCIsIm1heCIsImtleSIsImdyb3VwTmV4dFBvc2l0aW9uIiwicG93IiwiY2VpbCIsImxvZzEwIiwiZml4TmV3TGluZUFmdGVySW1wb3J0IiwicHJldmlvdXNJbXBvcnQiLCJwcmV2Um9vdCIsImVuZE9mTGluZSIsImluc2VydFRleHRBZnRlclJhbmdlIiwicmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0IiwiY3VycmVudEltcG9ydCIsImN1cnJSb290IiwicmFuZ2VUb1JlbW92ZSIsInJlbW92ZVJhbmdlIiwibWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydCIsIm5ld2xpbmVzQmV0d2VlbkltcG9ydHMiLCJkaXN0aW5jdEdyb3VwIiwiZ2V0TnVtYmVyT2ZFbXB0eUxpbmVzQmV0d2VlbiIsImxpbmVzQmV0d2VlbkltcG9ydHMiLCJsaW5lcyIsInRyaW0iLCJnZXRJc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZW1wdHlMaW5lc0JldHdlZW4iLCJpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZ2V0QWxwaGFiZXRpemVDb25maWciLCJvcHRpb25zIiwiYWxwaGFiZXRpemUiLCJkZWZhdWx0RGlzdGluY3RHcm91cCIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwiZG9jcyIsImNhdGVnb3J5IiwiZGVzY3JpcHRpb24iLCJ1cmwiLCJmaXhhYmxlIiwic2NoZW1hIiwicHJvcGVydGllcyIsInBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzIiwiaXRlbXMiLCJhZGRpdGlvbmFsUHJvcGVydGllcyIsInJlcXVpcmVkIiwid2Fybk9uVW5hc3NpZ25lZEltcG9ydHMiLCJjcmVhdGUiLCJpbXBvcnRPcmRlclJ1bGUiLCJTZXQiLCJlcnJvciIsIlByb2dyYW0iLCJpbXBvcnRNYXAiLCJNYXAiLCJnZXRCbG9ja0ltcG9ydHMiLCJzZXQiLCJnZXQiLCJJbXBvcnREZWNsYXJhdGlvbiIsImhhbmRsZUltcG9ydHMiLCJzb3VyY2UiLCJUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uIiwiaXNFeHBvcnQiLCJnZXRUZXh0IiwiQ2FsbEV4cHJlc3Npb24iLCJoYW5kbGVSZXF1aXJlcyIsImJsb2NrIiwicmVwb3J0QW5kUmVzZXQiLCJjbGVhciJdLCJtYXBwaW5ncyI6IkFBQUEsYTs7QUFFQSxzQztBQUNBLCtDO0FBQ0Esd0M7O0FBRUEsZ0Q7QUFDQSxzRDtBQUNBLHFDOztBQUVBLElBQU1BLGdCQUFnQixDQUFDLFNBQUQsRUFBWSxVQUFaLEVBQXdCLFFBQXhCLEVBQWtDLFNBQWxDLEVBQTZDLE9BQTdDLENB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QyxFQUE2Q3NMLHNCQUE3QyxFQUFxRUMsYUFBckU7QUFDRDs7QUFFRCxrQkFBSVUsWUFBWTFJLEtBQVosS0FBc0IsUUFBMUIsRUFBb0M7QUFDbENzRCx5Q0FBeUI3RyxRQUF6QixFQUFtQ2lNLFdBQW5DO0FBQ0Q7O0FBRUQvRyxtQ0FBcUI1QixPQUFyQixFQUE4QnRELFFBQTlCO0FBQ0QsYUFWRDs7QUFZQXVOLHNCQUFVZSxLQUFWO0FBQ0QsV0FkRCxPQUF5QkQsY0FBekIsSUF2RUssRUFBUDs7QUF1RkQsS0F6SEQsT0FBaUJsQixlQUFqQixJQXhGZSxFQUFqQiIsImZpbGUiOiJvcmRlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IG1pbmltYXRjaCBmcm9tICdtaW5pbWF0Y2gnO1xuaW1wb3J0IGluY2x1ZGVzIGZyb20gJ2FycmF5LWluY2x1ZGVzJztcbmltcG9ydCBncm91cEJ5IGZyb20gJ29iamVjdC5ncm91cGJ5JztcblxuaW1wb3J0IGltcG9ydFR5cGUgZnJvbSAnLi4vY29yZS9pbXBvcnRUeXBlJztcbmltcG9ydCBpc1N0YXRpY1JlcXVpcmUgZnJvbSAnLi4vY29yZS9zdGF0aWNSZXF1aXJlJztcbmltcG9ydCBkb2NzVXJsIGZyb20gJy4uL2RvY3NVcmwnO1xuXG5jb25zdCBkZWZhdWx0R3JvdXBzID0gWydidWlsdGluJywgJ2V4dGVybmFsJywgJ3BhcmVudCcsICdzaWJsaW5nJywgJ2luZGV4J107XG5cbi8vIFJFUE9SVElORyBBTkQgRklYSU5HXG5cbmZ1bmN0aW9uIHJldmVyc2UoYXJyYXkpIHtcbiAgcmV0dXJuIGFycmF5Lm1hcChmdW5jdGlvbiAodikge1xuICAgIHJldHVybiB7IC4uLnYsIHJhbms6IC12LnJhbmsgfTtcbiAgfSkucmV2ZXJzZSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QWZ0ZXIoY3VycmVudE5vZGVPclRva2VuKTtcbiAgICBpZiAoY3VycmVudE5vZGVPclRva2VuID09IG51bGwpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXN1bHQucHVzaChjdXJyZW50Tm9kZU9yVG9rZW4pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QmVmb3JlKGN1cnJlbnROb2RlT3JUb2tlbik7XG4gICAgaWYgKGN1cnJlbnROb2RlT3JUb2tlbiA9PSBudWxsKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0LnB1c2goY3VycmVudE5vZGVPclRva2VuKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gdGFrZVRva2Vuc0FmdGVyV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNBZnRlcihzb3VyY2VDb2RlLCBub2RlLCAxMDApO1xuICBjb25zdCByZXN1bHQgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiB0YWtlVG9rZW5zQmVmb3JlV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgMTAwKTtcbiAgY29uc3QgcmVzdWx0ID0gW107XG4gIGZvciAobGV0IGkgPSB0b2tlbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gZmluZE91dE9mT3JkZXIoaW1wb3J0ZWQpIHtcbiAgaWYgKGltcG9ydGVkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBsZXQgbWF4U2VlblJhbmtOb2RlID0gaW1wb3J0ZWRbMF07XG4gIHJldHVybiBpbXBvcnRlZC5maWx0ZXIoZnVuY3Rpb24gKGltcG9ydGVkTW9kdWxlKSB7XG4gICAgY29uc3QgcmVzID0gaW1wb3J0ZWRNb2R1bGUucmFuayA8IG1heFNlZW5SYW5rTm9kZS5yYW5rO1xuICAgIGlmIChtYXhTZWVuUmFua05vZGUucmFuayA8IGltcG9ydGVkTW9kdWxlLnJhbmspIHtcbiAgICAgIG1heFNlZW5SYW5rTm9kZSA9IGltcG9ydGVkTW9kdWxlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFJvb3ROb2RlKG5vZGUpIHtcbiAgbGV0IHBhcmVudCA9IG5vZGU7XG4gIHdoaWxlIChwYXJlbnQucGFyZW50ICE9IG51bGwgJiYgcGFyZW50LnBhcmVudC5ib2R5ID09IG51bGwpIHtcbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuICB9XG4gIHJldHVybiBwYXJlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkge1xuICByZXR1cm4gKHRva2VuKSA9PiAodG9rZW4udHlwZSA9PT0gJ0Jsb2NrJyB8fCAgdG9rZW4udHlwZSA9PT0gJ0xpbmUnKVxuICAgICYmIHRva2VuLmxvYy5zdGFydC5saW5lID09PSB0b2tlbi5sb2MuZW5kLmxpbmVcbiAgICAmJiB0b2tlbi5sb2MuZW5kLmxpbmUgPT09IG5vZGUubG9jLmVuZC5saW5lO1xufVxuXG5mdW5jdGlvbiBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIG5vZGUpIHtcbiAgY29uc3QgdG9rZW5zVG9FbmRPZkxpbmUgPSB0YWtlVG9rZW5zQWZ0ZXJXaGlsZShzb3VyY2VDb2RlLCBub2RlLCBjb21tZW50T25TYW1lTGluZUFzKG5vZGUpKTtcbiAgY29uc3QgZW5kT2ZUb2tlbnMgPSB0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggPiAwXG4gICAgPyB0b2tlbnNUb0VuZE9mTGluZVt0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggLSAxXS5yYW5nZVsxXVxuICAgIDogbm9kZS5yYW5nZVsxXTtcbiAgbGV0IHJlc3VsdCA9IGVuZE9mVG9rZW5zO1xuICBmb3IgKGxldCBpID0gZW5kT2ZUb2tlbnM7IGkgPCBzb3VyY2VDb2RlLnRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoc291cmNlQ29kZS50ZXh0W2ldID09PSAnXFxuJykge1xuICAgICAgcmVzdWx0ID0gaSArIDE7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJyAnICYmIHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJ1xcdCcgJiYgc291cmNlQ29kZS50ZXh0W2ldICE9PSAnXFxyJykge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJlc3VsdCA9IGkgKyAxO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBub2RlKSB7XG4gIGNvbnN0IHRva2Vuc1RvRW5kT2ZMaW5lID0gdGFrZVRva2Vuc0JlZm9yZVdoaWxlKHNvdXJjZUNvZGUsIG5vZGUsIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkpO1xuICBjb25zdCBzdGFydE9mVG9rZW5zID0gdG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoID4gMCA/IHRva2Vuc1RvRW5kT2ZMaW5lWzBdLnJhbmdlWzBdIDogbm9kZS5yYW5nZVswXTtcbiAgbGV0IHJlc3VsdCA9IHN0YXJ0T2ZUb2tlbnM7XG4gIGZvciAobGV0IGkgPSBzdGFydE9mVG9rZW5zIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGlmIChzb3VyY2VDb2RlLnRleHRbaV0gIT09ICcgJyAmJiBzb3VyY2VDb2RlLnRleHRbaV0gIT09ICdcXHQnKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0ID0gaTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpc1JlcXVpcmVFeHByZXNzaW9uKGV4cHIpIHtcbiAgcmV0dXJuIGV4cHIgIT0gbnVsbFxuICAgICYmIGV4cHIudHlwZSA9PT0gJ0NhbGxFeHByZXNzaW9uJ1xuICAgICYmIGV4cHIuY2FsbGVlICE9IG51bGxcbiAgICAmJiBleHByLmNhbGxlZS5uYW1lID09PSAncmVxdWlyZSdcbiAgICAmJiBleHByLmFyZ3VtZW50cyAhPSBudWxsXG4gICAgJiYgZXhwci5hcmd1bWVudHMubGVuZ3RoID09PSAxXG4gICAgJiYgZXhwci5hcmd1bWVudHNbMF0udHlwZSA9PT0gJ0xpdGVyYWwnO1xufVxuXG5mdW5jdGlvbiBpc1N1cHBvcnRlZFJlcXVpcmVNb2R1bGUobm9kZSkge1xuICBpZiAobm9kZS50eXBlICE9PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKG5vZGUuZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBkZWNsID0gbm9kZS5kZWNsYXJhdGlvbnNbMF07XG4gIGNvbnN0IGlzUGxhaW5SZXF1aXJlID0gZGVjbC5pZFxuICAgICYmIChkZWNsLmlkLnR5cGUgPT09ICdJZGVudGlmaWVyJyB8fCBkZWNsLmlkLnR5cGUgPT09ICdPYmplY3RQYXR0ZXJuJylcbiAgICAmJiBpc1JlcXVpcmVFeHByZXNzaW9uKGRlY2wuaW5pdCk7XG4gIGNvbnN0IGlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uID0gZGVjbC5pZFxuICAgICYmIChkZWNsLmlkLnR5cGUgPT09ICdJZGVudGlmaWVyJyB8fCBkZWNsLmlkLnR5cGUgPT09ICdPYmplY3RQYXR0ZXJuJylcbiAgICAmJiBkZWNsLmluaXQgIT0gbnVsbFxuICAgICYmIGRlY2wuaW5pdC50eXBlID09PSAnQ2FsbEV4cHJlc3Npb24nXG4gICAgJiYgZGVjbC5pbml0LmNhbGxlZSAhPSBudWxsXG4gICAgJiYgZGVjbC5pbml0LmNhbGxlZS50eXBlID09PSAnTWVtYmVyRXhwcmVzc2lvbidcbiAgICAmJiBpc1JlcXVpcmVFeHByZXNzaW9uKGRlY2wuaW5pdC5jYWxsZWUub2JqZWN0KTtcbiAgcmV0dXJuIGlzUGxhaW5SZXF1aXJlIHx8IGlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBpc1BsYWluSW1wb3J0TW9kdWxlKG5vZGUpIHtcbiAgcmV0dXJuIG5vZGUudHlwZSA9PT0gJ0ltcG9ydERlY2xhcmF0aW9uJyAmJiBub2RlLnNwZWNpZmllcnMgIT0gbnVsbCAmJiBub2RlLnNwZWNpZmllcnMubGVuZ3RoID4gMDtcbn1cblxuZnVuY3Rpb24gaXNQbGFpbkltcG9ydEVxdWFscyhub2RlKSB7XG4gIHJldHVybiBub2RlLnR5cGUgPT09ICdUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uJyAmJiBub2RlLm1vZHVsZVJlZmVyZW5jZS5leHByZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBjYW5Dcm9zc05vZGVXaGlsZVJlb3JkZXIobm9kZSkge1xuICByZXR1cm4gaXNTdXBwb3J0ZWRSZXF1aXJlTW9kdWxlKG5vZGUpIHx8IGlzUGxhaW5JbXBvcnRNb2R1bGUobm9kZSkgfHwgaXNQbGFpbkltcG9ydEVxdWFscyhub2RlKTtcbn1cblxuZnVuY3Rpb24gY2FuUmVvcmRlckl0ZW1zKGZpcnN0Tm9kZSwgc2Vjb25kTm9kZSkge1xuICBjb25zdCBwYXJlbnQgPSBmaXJzdE5vZGUucGFyZW50O1xuICBjb25zdCBbZmlyc3RJbmRleCwgc2Vjb25kSW5kZXhdID0gW1xuICAgIHBhcmVudC5ib2R5LmluZGV4T2YoZmlyc3ROb2RlKSxcbiAgICBwYXJlbnQuYm9keS5pbmRleE9mKHNlY29uZE5vZGUpLFxuICBdLnNvcnQoKTtcbiAgY29uc3Qgbm9kZXNCZXR3ZWVuID0gcGFyZW50LmJvZHkuc2xpY2UoZmlyc3RJbmRleCwgc2Vjb25kSW5kZXggKyAxKTtcbiAgZm9yIChjb25zdCBub2RlQmV0d2VlbiBvZiBub2Rlc0JldHdlZW4pIHtcbiAgICBpZiAoIWNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlcihub2RlQmV0d2VlbikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG1ha2VJbXBvcnREZXNjcmlwdGlvbihub2RlKSB7XG4gIGlmIChub2RlLm5vZGUuaW1wb3J0S2luZCA9PT0gJ3R5cGUnKSB7XG4gICAgcmV0dXJuICd0eXBlIGltcG9ydCc7XG4gIH1cbiAgaWYgKG5vZGUubm9kZS5pbXBvcnRLaW5kID09PSAndHlwZW9mJykge1xuICAgIHJldHVybiAndHlwZW9mIGltcG9ydCc7XG4gIH1cbiAgcmV0dXJuICdpbXBvcnQnO1xufVxuXG5mdW5jdGlvbiBmaXhPdXRPZk9yZGVyKGNvbnRleHQsIGZpcnN0Tm9kZSwgc2Vjb25kTm9kZSwgb3JkZXIpIHtcbiAgY29uc3Qgc291cmNlQ29kZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpO1xuXG4gIGNvbnN0IGZpcnN0Um9vdCA9IGZpbmRSb290Tm9kZShmaXJzdE5vZGUubm9kZSk7XG4gIGNvbnN0IGZpcnN0Um9vdFN0YXJ0ID0gZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIGZpcnN0Um9vdCk7XG4gIGNvbnN0IGZpcnN0Um9vdEVuZCA9IGZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgZmlyc3RSb290KTtcblxuICBjb25zdCBzZWNvbmRSb290ID0gZmluZFJvb3ROb2RlKHNlY29uZE5vZGUubm9kZSk7XG4gIGNvbnN0IHNlY29uZFJvb3RTdGFydCA9IGZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBzZWNvbmRSb290KTtcbiAgY29uc3Qgc2Vjb25kUm9vdEVuZCA9IGZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgc2Vjb25kUm9vdCk7XG4gIGNvbnN0IGNhbkZpeCA9IGNhblJlb3JkZXJJdGVtcyhmaXJzdFJvb3QsIHNlY29uZFJvb3QpO1xuXG4gIGxldCBuZXdDb2RlID0gc291cmNlQ29kZS50ZXh0LnN1YnN0cmluZyhzZWNvbmRSb290U3RhcnQsIHNlY29uZFJvb3RFbmQpO1xuICBpZiAobmV3Q29kZVtuZXdDb2RlLmxlbmd0aCAtIDFdICE9PSAnXFxuJykge1xuICAgIG5ld0NvZGUgPSBgJHtuZXdDb2RlfVxcbmA7XG4gIH1cblxuICBjb25zdCBmaXJzdEltcG9ydCA9IGAke21ha2VJbXBvcnREZXNjcmlwdGlvbihmaXJzdE5vZGUpfSBvZiBcXGAke2ZpcnN0Tm9kZS5kaXNwbGF5TmFtZX1cXGBgO1xuICBjb25zdCBzZWNvbmRJbXBvcnQgPSBgXFxgJHtzZWNvbmROb2RlLmRpc3BsYXlOYW1lfVxcYCAke21ha2VJbXBvcnREZXNjcmlwdGlvbihzZWNvbmROb2RlKX1gO1xuICBjb25zdCBtZXNzYWdlID0gYCR7c2Vjb25kSW1wb3J0fSBzaG91bGQgb2NjdXIgJHtvcmRlcn0gJHtmaXJzdEltcG9ydH1gO1xuXG4gIGlmIChvcmRlciA9PT0gJ2JlZm9yZScpIHtcbiAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICBub2RlOiBzZWNvbmROb2RlLm5vZGUsXG4gICAgICBtZXNzYWdlLFxuICAgICAgZml4OiBjYW5GaXggJiYgKChmaXhlcikgPT4gZml4ZXIucmVwbGFjZVRleHRSYW5nZShcbiAgICAgICAgW2ZpcnN0Um9vdFN0YXJ0LCBzZWNvbmRSb290RW5kXSxcbiAgICAgICAgbmV3Q29kZSArIHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcoZmlyc3RSb290U3RhcnQsIHNlY29uZFJvb3RTdGFydCksXG4gICAgICApKSxcbiAgICB9KTtcbiAgfSBlbHNlIGlmIChvcmRlciA9PT0gJ2FmdGVyJykge1xuICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgIG5vZGU6IHNlY29uZE5vZGUubm9kZSxcbiAgICAgIG1lc3NhZ2UsXG4gICAgICBmaXg6IGNhbkZpeCAmJiAoKGZpeGVyKSA9PiBmaXhlci5yZXBsYWNlVGV4dFJhbmdlKFxuICAgICAgICBbc2Vjb25kUm9vdFN0YXJ0LCBmaXJzdFJvb3RFbmRdLFxuICAgICAgICBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKHNlY29uZFJvb3RFbmQsIGZpcnN0Um9vdEVuZCkgKyBuZXdDb2RlLFxuICAgICAgKSksXG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVwb3J0T3V0T2ZPcmRlcihjb250ZXh0LCBpbXBvcnRlZCwgb3V0T2ZPcmRlciwgb3JkZXIpIHtcbiAgb3V0T2ZPcmRlci5mb3JFYWNoKGZ1bmN0aW9uIChpbXApIHtcbiAgICBjb25zdCBmb3VuZCA9IGltcG9ydGVkLmZpbmQoZnVuY3Rpb24gaGFzSGlnaGVyUmFuayhpbXBvcnRlZEl0ZW0pIHtcbiAgICAgIHJldHVybiBpbXBvcnRlZEl0ZW0ucmFuayA+IGltcC5yYW5rO1xuICAgIH0pO1xuICAgIGZpeE91dE9mT3JkZXIoY29udGV4dCwgZm91bmQsIGltcCwgb3JkZXIpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gbWFrZU91dE9mT3JkZXJSZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQpIHtcbiAgY29uc3Qgb3V0T2ZPcmRlciA9IGZpbmRPdXRPZk9yZGVyKGltcG9ydGVkKTtcbiAgaWYgKCFvdXRPZk9yZGVyLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZXJlIGFyZSB0aGluZ3MgdG8gcmVwb3J0LiBUcnkgdG8gbWluaW1pemUgdGhlIG51bWJlciBvZiByZXBvcnRlZCBlcnJvcnMuXG4gIGNvbnN0IHJldmVyc2VkSW1wb3J0ZWQgPSByZXZlcnNlKGltcG9ydGVkKTtcbiAgY29uc3QgcmV2ZXJzZWRPcmRlciA9IGZpbmRPdXRPZk9yZGVyKHJldmVyc2VkSW1wb3J0ZWQpO1xuICBpZiAocmV2ZXJzZWRPcmRlci5sZW5ndGggPCBvdXRPZk9yZGVyLmxlbmd0aCkge1xuICAgIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgcmV2ZXJzZWRJbXBvcnRlZCwgcmV2ZXJzZWRPcmRlciwgJ2FmdGVyJyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgaW1wb3J0ZWQsIG91dE9mT3JkZXIsICdiZWZvcmUnKTtcbn1cblxuY29uc3QgY29tcGFyZVN0cmluZyA9IChhLCBiKSA9PiB7XG4gIGlmIChhIDwgYikge1xuICAgIHJldHVybiAtMTtcbiAgfVxuICBpZiAoYSA+IGIpIHtcbiAgICByZXR1cm4gMTtcbiAgfVxuICByZXR1cm4gMDtcbn07XG5cbi8qKiBTb21lIHBhcnNlcnMgKGxhbmd1YWdlcyB3aXRob3V0IHR5cGVzKSBkb24ndCBwcm92aWRlIEltcG9ydEtpbmQgKi9cbmNvbnN0IERFQUZVTFRfSU1QT1JUX0tJTkQgPSAndmFsdWUnO1xuY29uc3QgZ2V0Tm9ybWFsaXplZFZhbHVlID0gKG5vZGUsIHRvTG93ZXJDYXNlKSA9PiB7XG4gIGNvbnN0IHZhbHVlID0gbm9kZS52YWx1ZTtcbiAgcmV0dXJuIHRvTG93ZXJDYXNlID8gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpIDogdmFsdWU7XG59O1xuXG5mdW5jdGlvbiBnZXRTb3J0ZXIoYWxwaGFiZXRpemVPcHRpb25zKSB7XG4gIGNvbnN0IG11bHRpcGxpZXIgPSBhbHBoYWJldGl6ZU9wdGlvbnMub3JkZXIgPT09ICdhc2MnID8gMSA6IC0xO1xuICBjb25zdCBvcmRlckltcG9ydEtpbmQgPSBhbHBoYWJldGl6ZU9wdGlvbnMub3JkZXJJbXBvcnRLaW5kO1xuICBjb25zdCBtdWx0aXBsaWVySW1wb3J0S2luZCA9IG9yZGVySW1wb3J0S2luZCAhPT0gJ2lnbm9yZSdcbiAgICAmJiAoYWxwaGFiZXRpemVPcHRpb25zLm9yZGVySW1wb3J0S2luZCA9PT0gJ2FzYycgPyAxIDogLTEpO1xuXG4gIHJldHVybiBmdW5jdGlvbiBpbXBvcnRzU29ydGVyKG5vZGVBLCBub2RlQikge1xuICAgIGNvbnN0IGltcG9ydEEgPSBnZXROb3JtYWxpemVkVmFsdWUobm9kZUEsIGFscGhhYmV0aXplT3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUpO1xuICAgIGNvbnN0IGltcG9ydEIgPSBnZXROb3JtYWxpemVkVmFsdWUobm9kZUIsIGFscGhhYmV0aXplT3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUpO1xuICAgIGxldCByZXN1bHQgPSAwO1xuXG4gICAgaWYgKCFpbmNsdWRlcyhpbXBvcnRBLCAnLycpICYmICFpbmNsdWRlcyhpbXBvcnRCLCAnLycpKSB7XG4gICAgICByZXN1bHQgPSBjb21wYXJlU3RyaW5nKGltcG9ydEEsIGltcG9ydEIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBBID0gaW1wb3J0QS5zcGxpdCgnLycpO1xuICAgICAgY29uc3QgQiA9IGltcG9ydEIuc3BsaXQoJy8nKTtcbiAgICAgIGNvbnN0IGEgPSBBLmxlbmd0aDtcbiAgICAgIGNvbnN0IGIgPSBCLmxlbmd0aDtcblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihhLCBiKTsgaSsrKSB7XG4gICAgICAgIHJlc3VsdCA9IGNvbXBhcmVTdHJpbmcoQVtpXSwgQltpXSk7XG4gICAgICAgIGlmIChyZXN1bHQpIHsgYnJlYWs7IH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXN1bHQgJiYgYSAhPT0gYikge1xuICAgICAgICByZXN1bHQgPSBhIDwgYiA/IC0xIDogMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXN1bHQgPSByZXN1bHQgKiBtdWx0aXBsaWVyO1xuXG4gICAgLy8gSW4gY2FzZSB0aGUgcGF0aHMgYXJlIGVxdWFsIChyZXN1bHQgPT09IDApLCBzb3J0IHRoZW0gYnkgaW1wb3J0S2luZFxuICAgIGlmICghcmVzdWx0ICYmIG11bHRpcGxpZXJJbXBvcnRLaW5kKSB7XG4gICAgICByZXN1bHQgPSBtdWx0aXBsaWVySW1wb3J0S2luZCAqIGNvbXBhcmVTdHJpbmcoXG4gICAgICAgIG5vZGVBLm5vZGUuaW1wb3J0S2luZCB8fCBERUFGVUxUX0lNUE9SVF9LSU5ELFxuICAgICAgICBub2RlQi5ub2RlLmltcG9ydEtpbmQgfHwgREVBRlVMVF9JTVBPUlRfS0lORCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cblxuZnVuY3Rpb24gbXV0YXRlUmFua3NUb0FscGhhYmV0aXplKGltcG9ydGVkLCBhbHBoYWJldGl6ZU9wdGlvbnMpIHtcbiAgY29uc3QgZ3JvdXBlZEJ5UmFua3MgPSBncm91cEJ5KGltcG9ydGVkLCAoaXRlbSkgPT4gaXRlbS5yYW5rKTtcblxuICBjb25zdCBzb3J0ZXJGbiA9IGdldFNvcnRlcihhbHBoYWJldGl6ZU9wdGlvbnMpO1xuXG4gIC8vIHNvcnQgZ3JvdXAga2V5cyBzbyB0aGF0IHRoZXkgY2FuIGJlIGl0ZXJhdGVkIG9uIGluIG9yZGVyXG4gIGNvbnN0IGdyb3VwUmFua3MgPSBPYmplY3Qua2V5cyhncm91cGVkQnlSYW5rcykuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgIHJldHVybiBhIC0gYjtcbiAgfSk7XG5cbiAgLy8gc29ydCBpbXBvcnRzIGxvY2FsbHkgd2l0aGluIHRoZWlyIGdyb3VwXG4gIGdyb3VwUmFua3MuZm9yRWFjaChmdW5jdGlvbiAoZ3JvdXBSYW5rKSB7XG4gICAgZ3JvdXBlZEJ5UmFua3NbZ3JvdXBSYW5rXS5zb3J0KHNvcnRlckZuKTtcbiAgfSk7XG5cbiAgLy8gYXNzaWduIGdsb2JhbGx5IHVuaXF1ZSByYW5rIHRvIGVhY2ggaW1wb3J0XG4gIGxldCBuZXdSYW5rID0gMDtcbiAgY29uc3QgYWxwaGFiZXRpemVkUmFua3MgPSBncm91cFJhbmtzLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBncm91cFJhbmspIHtcbiAgICBncm91cGVkQnlSYW5rc1tncm91cFJhbmtdLmZvckVhY2goZnVuY3Rpb24gKGltcG9ydGVkSXRlbSkge1xuICAgICAgYWNjW2Ake2ltcG9ydGVkSXRlbS52YWx1ZX18JHtpbXBvcnRlZEl0ZW0ubm9kZS5pbXBvcnRLaW5kfWBdID0gcGFyc2VJbnQoZ3JvdXBSYW5rLCAxMCkgKyBuZXdSYW5rO1xuICAgICAgbmV3UmFuayArPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICAvLyBtdXRhdGUgdGhlIG9yaWdpbmFsIGdyb3VwLXJhbmsgd2l0aCBhbHBoYWJldGl6ZWQtcmFua1xuICBpbXBvcnRlZC5mb3JFYWNoKGZ1bmN0aW9uIChpbXBvcnRlZEl0ZW0pIHtcbiAgICBpbXBvcnRlZEl0ZW0ucmFuayA9IGFscGhhYmV0aXplZFJhbmtzW2Ake2ltcG9ydGVkSXRlbS52YWx1ZX18JHtpbXBvcnRlZEl0ZW0ubm9kZS5pbXBvcnRLaW5kfWBdO1xuICB9KTtcbn1cblxuLy8gREVURUNUSU5HXG5cbmZ1bmN0aW9uIGNvbXB1dGVQYXRoUmFuayhyYW5rcywgcGF0aEdyb3VwcywgcGF0aCwgbWF4UG9zaXRpb24pIHtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBwYXRoR3JvdXBzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGNvbnN0IHsgcGF0dGVybiwgcGF0dGVybk9wdGlvbnMsIHBhdHRlcm5UeXBlLCBncm91cCwgcG9zaXRpb24gPSAxIH0gPSBwYXRoR3JvdXBzW2ldO1xuICAgIHN3aXRjaCAocGF0dGVyblR5cGUpIHtcbiAgICAgIGNhc2UgJ3JlJzpcbiAgICAgICAgaWYgKG5ldyBSZWdFeHAocGF0dGVybiwgcGF0dGVybk9wdGlvbnMpLnRlc3QocGF0aCkpIHtcbiAgICAgICAgICByZXR1cm4gcmFua3NbZ3JvdXBdICsgcG9zaXRpb24gLyBtYXhQb3NpdGlvbjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnZ2xvYic6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobWluaW1hdGNoKHBhdGgsIHBhdHRlcm4sIHBhdHRlcm5PcHRpb25zIHx8IHsgbm9jb21tZW50OiB0cnVlIH0pKSB7XG4gICAgICAgICAgcmV0dXJuIHJhbmtzW2dyb3VwXSArIHBvc2l0aW9uIC8gbWF4UG9zaXRpb247XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSYW5rKGNvbnRleHQsIHJhbmtzLCBpbXBvcnRFbnRyeSwgZXhjbHVkZWRJbXBvcnRUeXBlcykge1xuICBsZXQgaW1wVHlwZTtcbiAgbGV0IHJhbms7XG4gIGlmIChpbXBvcnRFbnRyeS50eXBlID09PSAnaW1wb3J0Om9iamVjdCcpIHtcbiAgICBpbXBUeXBlID0gJ29iamVjdCc7XG4gIH0gZWxzZSBpZiAoaW1wb3J0RW50cnkubm9kZS5pbXBvcnRLaW5kID09PSAndHlwZScgJiYgcmFua3Mub21pdHRlZFR5cGVzLmluZGV4T2YoJ3R5cGUnKSA9PT0gLTEpIHtcbiAgICBpbXBUeXBlID0gJ3R5cGUnO1xuICB9IGVsc2Uge1xuICAgIGltcFR5cGUgPSBpbXBvcnRUeXBlKGltcG9ydEVudHJ5LnZhbHVlLCBjb250ZXh0KTtcbiAgfVxuICBpZiAoIWV4Y2x1ZGVkSW1wb3J0VHlwZXMuaGFzKGltcFR5cGUpKSB7XG4gICAgcmFuayA9IGNvbXB1dGVQYXRoUmFuayhyYW5rcy5ncm91cHMsIHJhbmtzLnBhdGhHcm91cHMsIGltcG9ydEVudHJ5LnZhbHVlLCByYW5rcy5tYXhQb3NpdGlvbik7XG4gIH1cbiAgaWYgKHR5cGVvZiByYW5rID09PSAndW5kZWZpbmVkJykge1xuICAgIHJhbmsgPSByYW5rcy5ncm91cHNbaW1wVHlwZV07XG4gIH1cbiAgaWYgKGltcG9ydEVudHJ5LnR5cGUgIT09ICdpbXBvcnQnICYmICFpbXBvcnRFbnRyeS50eXBlLnN0YXJ0c1dpdGgoJ2ltcG9ydDonKSkge1xuICAgIHJhbmsgKz0gMTAwO1xuICB9XG5cbiAgcmV0dXJuIHJhbms7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyTm9kZShjb250ZXh0LCBpbXBvcnRFbnRyeSwgcmFua3MsIGltcG9ydGVkLCBleGNsdWRlZEltcG9ydFR5cGVzKSB7XG4gIGNvbnN0IHJhbmsgPSBjb21wdXRlUmFuayhjb250ZXh0LCByYW5rcywgaW1wb3J0RW50cnksIGV4Y2x1ZGVkSW1wb3J0VHlwZXMpO1xuICBpZiAocmFuayAhPT0gLTEpIHtcbiAgICBpbXBvcnRlZC5wdXNoKHsgLi4uaW1wb3J0RW50cnksIHJhbmsgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZUJsb2NrKG5vZGUpIHtcbiAgbGV0IG4gPSBub2RlO1xuICAvLyBIYW5kbGUgY2FzZXMgbGlrZSBgY29uc3QgYmF6ID0gcmVxdWlyZSgnZm9vJykuYmFyLmJhemBcbiAgLy8gYW5kIGBjb25zdCBmb28gPSByZXF1aXJlKCdmb28nKSgpYFxuICB3aGlsZSAoXG4gICAgbi5wYXJlbnQudHlwZSA9PT0gJ01lbWJlckV4cHJlc3Npb24nICYmIG4ucGFyZW50Lm9iamVjdCA9PT0gblxuICAgIHx8IG4ucGFyZW50LnR5cGUgPT09ICdDYWxsRXhwcmVzc2lvbicgJiYgbi5wYXJlbnQuY2FsbGVlID09PSBuXG4gICkge1xuICAgIG4gPSBuLnBhcmVudDtcbiAgfVxuICBpZiAoXG4gICAgbi5wYXJlbnQudHlwZSA9PT0gJ1ZhcmlhYmxlRGVjbGFyYXRvcidcbiAgICAmJiBuLnBhcmVudC5wYXJlbnQudHlwZSA9PT0gJ1ZhcmlhYmxlRGVjbGFyYXRpb24nXG4gICAgJiYgbi5wYXJlbnQucGFyZW50LnBhcmVudC50eXBlID09PSAnUHJvZ3JhbSdcbiAgKSB7XG4gICAgcmV0dXJuIG4ucGFyZW50LnBhcmVudC5wYXJlbnQ7XG4gIH1cbn1cblxuY29uc3QgdHlwZXMgPSBbJ2J1aWx0aW4nLCAnZXh0ZXJuYWwnLCAnaW50ZXJuYWwnLCAndW5rbm93bicsICdwYXJlbnQnLCAnc2libGluZycsICdpbmRleCcsICdvYmplY3QnLCAndHlwZSddO1xuXG4vLyBDcmVhdGVzIGFuIG9iamVjdCB3aXRoIHR5cGUtcmFuayBwYWlycy5cbi8vIEV4YW1wbGU6IHsgaW5kZXg6IDAsIHNpYmxpbmc6IDEsIHBhcmVudDogMSwgZXh0ZXJuYWw6IDEsIGJ1aWx0aW46IDIsIGludGVybmFsOiAyIH1cbi8vIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgaXQgY29udGFpbnMgYSB0eXBlIHRoYXQgZG9lcyBub3QgZXhpc3QsIG9yIGhhcyBhIGR1cGxpY2F0ZVxuZnVuY3Rpb24gY29udmVydEdyb3Vwc1RvUmFua3MoZ3JvdXBzKSB7XG4gIGNvbnN0IHJhbmtPYmplY3QgPSBncm91cHMucmVkdWNlKGZ1bmN0aW9uIChyZXMsIGdyb3VwLCBpbmRleCkge1xuICAgIFtdLmNvbmNhdChncm91cCkuZm9yRWFjaChmdW5jdGlvbiAoZ3JvdXBJdGVtKSB7XG4gICAgICBpZiAodHlwZXMuaW5kZXhPZihncm91cEl0ZW0pID09PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEluY29ycmVjdCBjb25maWd1cmF0aW9uIG9mIHRoZSBydWxlOiBVbmtub3duIHR5cGUgXFxgJHtKU09OLnN0cmluZ2lmeShncm91cEl0ZW0pfVxcYGApO1xuICAgICAgfVxuICAgICAgaWYgKHJlc1tncm91cEl0ZW1dICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbmNvcnJlY3QgY29uZmlndXJhdGlvbiBvZiB0aGUgcnVsZTogXFxgJHtncm91cEl0ZW19XFxgIGlzIGR1cGxpY2F0ZWRgKTtcbiAgICAgIH1cbiAgICAgIHJlc1tncm91cEl0ZW1dID0gaW5kZXggKiAyO1xuICAgIH0pO1xuICAgIHJldHVybiByZXM7XG4gIH0sIHt9KTtcblxuICBjb25zdCBvbWl0dGVkVHlwZXMgPSB0eXBlcy5maWx0ZXIoZnVuY3Rpb24gKHR5cGUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHJhbmtPYmplY3RbdHlwZV0gPT09ICd1bmRlZmluZWQnO1xuICB9KTtcblxuICBjb25zdCByYW5rcyA9IG9taXR0ZWRUeXBlcy5yZWR1Y2UoZnVuY3Rpb24gKHJlcywgdHlwZSkge1xuICAgIHJlc1t0eXBlXSA9IGdyb3Vwcy5sZW5ndGggKiAyO1xuICAgIHJldHVybiByZXM7XG4gIH0sIHJhbmtPYmplY3QpO1xuXG4gIHJldHVybiB7IGdyb3VwczogcmFua3MsIG9taXR0ZWRUeXBlcyB9O1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0UGF0aEdyb3Vwc0ZvclJhbmtzKHBhdGhHcm91cHMpIHtcbiAgY29uc3QgYWZ0ZXIgPSB7fTtcbiAgY29uc3QgYmVmb3JlID0ge307XG5cbiAgY29uc3QgdHJhbnNmb3JtZWQgPSBwYXRoR3JvdXBzLm1hcCgocGF0aEdyb3VwLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IHsgZ3JvdXAsIHBvc2l0aW9uOiBwb3NpdGlvblN0cmluZyB9ID0gcGF0aEdyb3VwO1xuICAgIGxldCBwb3NpdGlvbiA9IDA7XG4gICAgaWYgKHBvc2l0aW9uU3RyaW5nID09PSAnYWZ0ZXInKSB7XG4gICAgICBpZiAoIWFmdGVyW2dyb3VwXSkge1xuICAgICAgICBhZnRlcltncm91cF0gPSAxO1xuICAgICAgfVxuICAgICAgcG9zaXRpb24gPSBhZnRlcltncm91cF0rKztcbiAgICB9IGVsc2UgaWYgKHBvc2l0aW9uU3RyaW5nID09PSAnYmVmb3JlJykge1xuICAgICAgaWYgKCFiZWZvcmVbZ3JvdXBdKSB7XG4gICAgICAgIGJlZm9yZVtncm91cF0gPSBbXTtcbiAgICAgIH1cbiAgICAgIGJlZm9yZVtncm91cF0ucHVzaChpbmRleCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgLi4ucGF0aEdyb3VwLCBwb3NpdGlvbiB9O1xuICB9KTtcblxuICBsZXQgbWF4UG9zaXRpb24gPSAxO1xuXG4gIE9iamVjdC5rZXlzKGJlZm9yZSkuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBjb25zdCBncm91cExlbmd0aCA9IGJlZm9yZVtncm91cF0ubGVuZ3RoO1xuICAgIGJlZm9yZVtncm91cF0uZm9yRWFjaCgoZ3JvdXBJbmRleCwgaW5kZXgpID0+IHtcbiAgICAgIHRyYW5zZm9ybWVkW2dyb3VwSW5kZXhdLnBvc2l0aW9uID0gLTEgKiAoZ3JvdXBMZW5ndGggLSBpbmRleCk7XG4gICAgfSk7XG4gICAgbWF4UG9zaXRpb24gPSBNYXRoLm1heChtYXhQb3NpdGlvbiwgZ3JvdXBMZW5ndGgpO1xuICB9KTtcblxuICBPYmplY3Qua2V5cyhhZnRlcikuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgY29uc3QgZ3JvdXBOZXh0UG9zaXRpb24gPSBhZnRlcltrZXldO1xuICAgIG1heFBvc2l0aW9uID0gTWF0aC5tYXgobWF4UG9zaXRpb24sIGdyb3VwTmV4dFBvc2l0aW9uIC0gMSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgcGF0aEdyb3VwczogdHJhbnNmb3JtZWQsXG4gICAgbWF4UG9zaXRpb246IG1heFBvc2l0aW9uID4gMTAgPyBNYXRoLnBvdygxMCwgTWF0aC5jZWlsKE1hdGgubG9nMTAobWF4UG9zaXRpb24pKSkgOiAxMCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZml4TmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIHByZXZpb3VzSW1wb3J0KSB7XG4gIGNvbnN0IHByZXZSb290ID0gZmluZFJvb3ROb2RlKHByZXZpb3VzSW1wb3J0Lm5vZGUpO1xuICBjb25zdCB0b2tlbnNUb0VuZE9mTGluZSA9IHRha2VUb2tlbnNBZnRlcldoaWxlKFxuICAgIGNvbnRleHQuZ2V0U291cmNlQ29kZSgpLCBwcmV2Um9vdCwgY29tbWVudE9uU2FtZUxpbmVBcyhwcmV2Um9vdCkpO1xuXG4gIGxldCBlbmRPZkxpbmUgPSBwcmV2Um9vdC5yYW5nZVsxXTtcbiAgaWYgKHRva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCA+IDApIHtcbiAgICBlbmRPZkxpbmUgPSB0b2tlbnNUb0VuZE9mTGluZVt0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggLSAxXS5yYW5nZVsxXTtcbiAgfVxuICByZXR1cm4gKGZpeGVyKSA9PiBmaXhlci5pbnNlcnRUZXh0QWZ0ZXJSYW5nZShbcHJldlJvb3QucmFuZ2VbMF0sIGVuZE9mTGluZV0sICdcXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSB7XG4gIGNvbnN0IHNvdXJjZUNvZGUgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKTtcbiAgY29uc3QgcHJldlJvb3QgPSBmaW5kUm9vdE5vZGUocHJldmlvdXNJbXBvcnQubm9kZSk7XG4gIGNvbnN0IGN1cnJSb290ID0gZmluZFJvb3ROb2RlKGN1cnJlbnRJbXBvcnQubm9kZSk7XG4gIGNvbnN0IHJhbmdlVG9SZW1vdmUgPSBbXG4gICAgZmluZEVuZE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBwcmV2Um9vdCksXG4gICAgZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIGN1cnJSb290KSxcbiAgXTtcbiAgaWYgKCgvXlxccyokLykudGVzdChzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKHJhbmdlVG9SZW1vdmVbMF0sIHJhbmdlVG9SZW1vdmVbMV0pKSkge1xuICAgIHJldHVybiAoZml4ZXIpID0+IGZpeGVyLnJlbW92ZVJhbmdlKHJhbmdlVG9SZW1vdmUpO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG1ha2VOZXdsaW5lc0JldHdlZW5SZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQsIG5ld2xpbmVzQmV0d2VlbkltcG9ydHMsIGRpc3RpbmN0R3JvdXApIHtcbiAgY29uc3QgZ2V0TnVtYmVyT2ZFbXB0eUxpbmVzQmV0d2VlbiA9IChjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCkgPT4ge1xuICAgIGNvbnN0IGxpbmVzQmV0d2VlbkltcG9ydHMgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKS5saW5lcy5zbGljZShcbiAgICAgIHByZXZpb3VzSW1wb3J0Lm5vZGUubG9jLmVuZC5saW5lLFxuICAgICAgY3VycmVudEltcG9ydC5ub2RlLmxvYy5zdGFydC5saW5lIC0gMSxcbiAgICApO1xuXG4gICAgcmV0dXJuIGxpbmVzQmV0d2VlbkltcG9ydHMuZmlsdGVyKChsaW5lKSA9PiAhbGluZS50cmltKCkubGVuZ3RoKS5sZW5ndGg7XG4gIH07XG4gIGNvbnN0IGdldElzU3RhcnRPZkRpc3RpbmN0R3JvdXAgPSAoY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpID0+IGN1cnJlbnRJbXBvcnQucmFuayAtIDEgPj0gcHJldmlvdXNJbXBvcnQucmFuaztcbiAgbGV0IHByZXZpb3VzSW1wb3J0ID0gaW1wb3J0ZWRbMF07XG5cbiAgaW1wb3J0ZWQuc2xpY2UoMSkuZm9yRWFjaChmdW5jdGlvbiAoY3VycmVudEltcG9ydCkge1xuICAgIGNvbnN0IGVtcHR5TGluZXNCZXR3ZWVuID0gZ2V0TnVtYmVyT2ZFbXB0eUxpbmVzQmV0d2VlbihjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCk7XG4gICAgY29uc3QgaXNTdGFydE9mRGlzdGluY3RHcm91cCA9IGdldElzU3RhcnRPZkRpc3RpbmN0R3JvdXAoY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpO1xuXG4gICAgaWYgKG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgPT09ICdhbHdheXMnXG4gICAgICB8fCBuZXdsaW5lc0JldHdlZW5JbXBvcnRzID09PSAnYWx3YXlzLWFuZC1pbnNpZGUtZ3JvdXBzJykge1xuICAgICAgaWYgKGN1cnJlbnRJbXBvcnQucmFuayAhPT0gcHJldmlvdXNJbXBvcnQucmFuayAmJiBlbXB0eUxpbmVzQmV0d2VlbiA9PT0gMCkge1xuICAgICAgICBpZiAoZGlzdGluY3RHcm91cCB8fCAhZGlzdGluY3RHcm91cCAmJiBpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICAgICAgbm9kZTogcHJldmlvdXNJbXBvcnQubm9kZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdUaGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIGVtcHR5IGxpbmUgYmV0d2VlbiBpbXBvcnQgZ3JvdXBzJyxcbiAgICAgICAgICAgIGZpeDogZml4TmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIHByZXZpb3VzSW1wb3J0KSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChlbXB0eUxpbmVzQmV0d2VlbiA+IDBcbiAgICAgICAgJiYgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cyAhPT0gJ2Fsd2F5cy1hbmQtaW5zaWRlLWdyb3VwcycpIHtcbiAgICAgICAgaWYgKGRpc3RpbmN0R3JvdXAgJiYgY3VycmVudEltcG9ydC5yYW5rID09PSBwcmV2aW91c0ltcG9ydC5yYW5rIHx8ICFkaXN0aW5jdEdyb3VwICYmICFpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICAgICAgbm9kZTogcHJldmlvdXNJbXBvcnQubm9kZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdUaGVyZSBzaG91bGQgYmUgbm8gZW1wdHkgbGluZSB3aXRoaW4gaW1wb3J0IGdyb3VwJyxcbiAgICAgICAgICAgIGZpeDogcmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW1wdHlMaW5lc0JldHdlZW4gPiAwKSB7XG4gICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgIG5vZGU6IHByZXZpb3VzSW1wb3J0Lm5vZGUsXG4gICAgICAgIG1lc3NhZ2U6ICdUaGVyZSBzaG91bGQgYmUgbm8gZW1wdHkgbGluZSBiZXR3ZWVuIGltcG9ydCBncm91cHMnLFxuICAgICAgICBmaXg6IHJlbW92ZU5ld0xpbmVBZnRlckltcG9ydChjb250ZXh0LCBjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBwcmV2aW91c0ltcG9ydCA9IGN1cnJlbnRJbXBvcnQ7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRBbHBoYWJldGl6ZUNvbmZpZyhvcHRpb25zKSB7XG4gIGNvbnN0IGFscGhhYmV0aXplID0gb3B0aW9ucy5hbHBoYWJldGl6ZSB8fCB7fTtcbiAgY29uc3Qgb3JkZXIgPSBhbHBoYWJldGl6ZS5vcmRlciB8fCAnaWdub3JlJztcbiAgY29uc3Qgb3JkZXJJbXBvcnRLaW5kID0gYWxwaGFiZXRpemUub3JkZXJJbXBvcnRLaW5kIHx8ICdpZ25vcmUnO1xuICBjb25zdCBjYXNlSW5zZW5zaXRpdmUgPSBhbHBoYWJldGl6ZS5jYXNlSW5zZW5zaXRpdmUgfHwgZmFsc2U7XG5cbiAgcmV0dXJuIHsgb3JkZXIsIG9yZGVySW1wb3J0S2luZCwgY2FzZUluc2Vuc2l0aXZlIH07XG59XG5cbi8vIFRPRE8sIHNlbXZlci1tYWpvcjogQ2hhbmdlIHRoZSBkZWZhdWx0IG9mIFwiZGlzdGluY3RHcm91cFwiIGZyb20gdHJ1ZSB0byBmYWxzZVxuY29uc3QgZGVmYXVsdERpc3RpbmN0R3JvdXAgPSB0cnVlO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbWV0YToge1xuICAgIHR5cGU6ICdzdWdnZXN0aW9uJyxcbiAgICBkb2NzOiB7XG4gICAgICBjYXRlZ29yeTogJ1N0eWxlIGd1aWRlJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5mb3JjZSBhIGNvbnZlbnRpb24gaW4gbW9kdWxlIGltcG9ydCBvcmRlci4nLFxuICAgICAgdXJsOiBkb2NzVXJsKCdvcmRlcicpLFxuICAgIH0sXG5cbiAgICBmaXhhYmxlOiAnY29kZScsXG4gICAgc2NoZW1hOiBbXG4gICAgICB7XG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgZ3JvdXBzOiB7XG4gICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBkaXN0aW5jdEdyb3VwOiB7XG4gICAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgICAgICBkZWZhdWx0OiBkZWZhdWx0RGlzdGluY3RHcm91cCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhdGhHcm91cHM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgcGF0dGVybk9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgcGF0dGVyblR5cGU6IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgZW51bTogWydyZScsICdnbG9iJ10sXG4gICAgICAgICAgICAgICAgICBkZWZhdWx0OiAnZ2xvYicsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBncm91cDoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICBlbnVtOiBbJ2FmdGVyJywgJ2JlZm9yZSddLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsncGF0dGVybicsICdncm91cCddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgICduZXdsaW5lcy1iZXR3ZWVuJzoge1xuICAgICAgICAgICAgZW51bTogW1xuICAgICAgICAgICAgICAnaWdub3JlJyxcbiAgICAgICAgICAgICAgJ2Fsd2F5cycsXG4gICAgICAgICAgICAgICdhbHdheXMtYW5kLWluc2lkZS1ncm91cHMnLFxuICAgICAgICAgICAgICAnbmV2ZXInLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFscGhhYmV0aXplOiB7XG4gICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBvcmRlcjoge1xuICAgICAgICAgICAgICAgIGVudW06IFsnaWdub3JlJywgJ2FzYycsICdkZXNjJ10sXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogJ2lnbm9yZScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG9yZGVySW1wb3J0S2luZDoge1xuICAgICAgICAgICAgICAgIGVudW06IFsnaWdub3JlJywgJ2FzYycsICdkZXNjJ10sXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogJ2lnbm9yZScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgd2Fybk9uVW5hc3NpZ25lZEltcG9ydHM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfSxcblxuICBjcmVhdGU6IGZ1bmN0aW9uIGltcG9ydE9yZGVyUnVsZShjb250ZXh0KSB7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGNvbnRleHQub3B0aW9uc1swXSB8fCB7fTtcbiAgICBjb25zdCBuZXdsaW5lc0JldHdlZW5JbXBvcnRzID0gb3B0aW9uc1snbmV3bGluZXMtYmV0d2VlbiddIHx8ICdpZ25vcmUnO1xuICAgIGNvbnN0IHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzID0gbmV3IFNldChvcHRpb25zLnBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzIHx8IFsnYnVpbHRpbicsICdleHRlcm5hbCcsICdvYmplY3QnXSk7XG4gICAgY29uc3QgYWxwaGFiZXRpemUgPSBnZXRBbHBoYWJldGl6ZUNvbmZpZyhvcHRpb25zKTtcbiAgICBjb25zdCBkaXN0aW5jdEdyb3VwID0gb3B0aW9ucy5kaXN0aW5jdEdyb3VwID09IG51bGwgPyBkZWZhdWx0RGlzdGluY3RHcm91cCA6ICEhb3B0aW9ucy5kaXN0aW5jdEdyb3VwO1xuICAgIGxldCByYW5rcztcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHBhdGhHcm91cHMsIG1heFBvc2l0aW9uIH0gPSBjb252ZXJ0UGF0aEdyb3Vwc0ZvclJhbmtzKG9wdGlvbnMucGF0aEdyb3VwcyB8fCBbXSk7XG4gICAgICBjb25zdCB7IGdyb3Vwcywgb21pdHRlZFR5cGVzIH0gPSBjb252ZXJ0R3JvdXBzVG9SYW5rcyhvcHRpb25zLmdyb3VwcyB8fCBkZWZhdWx0R3JvdXBzKTtcbiAgICAgIHJhbmtzID0ge1xuICAgICAgICBncm91cHMsXG4gICAgICAgIG9taXR0ZWRUeXBlcyxcbiAgICAgICAgcGF0aEdyb3VwcyxcbiAgICAgICAgbWF4UG9zaXRpb24sXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBNYWxmb3JtZWQgY29uZmlndXJhdGlvblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgUHJvZ3JhbShub2RlKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQobm9kZSwgZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH1cbiAgICBjb25zdCBpbXBvcnRNYXAgPSBuZXcgTWFwKCk7XG5cbiAgICBmdW5jdGlvbiBnZXRCbG9ja0ltcG9ydHMobm9kZSkge1xuICAgICAgaWYgKCFpbXBvcnRNYXAuaGFzKG5vZGUpKSB7XG4gICAgICAgIGltcG9ydE1hcC5zZXQobm9kZSwgW10pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGltcG9ydE1hcC5nZXQobm9kZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIEltcG9ydERlY2xhcmF0aW9uOiBmdW5jdGlvbiBoYW5kbGVJbXBvcnRzKG5vZGUpIHtcbiAgICAgICAgLy8gSWdub3JpbmcgdW5hc3NpZ25lZCBpbXBvcnRzIHVubGVzcyB3YXJuT25VbmFzc2lnbmVkSW1wb3J0cyBpcyBzZXRcbiAgICAgICAgaWYgKG5vZGUuc3BlY2lmaWVycy5sZW5ndGggfHwgb3B0aW9ucy53YXJuT25VbmFzc2lnbmVkSW1wb3J0cykge1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLnNvdXJjZS52YWx1ZTtcbiAgICAgICAgICByZWdpc3Rlck5vZGUoXG4gICAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICB2YWx1ZTogbmFtZSxcbiAgICAgICAgICAgICAgZGlzcGxheU5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgIHR5cGU6ICdpbXBvcnQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJhbmtzLFxuICAgICAgICAgICAgZ2V0QmxvY2tJbXBvcnRzKG5vZGUucGFyZW50KSxcbiAgICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uOiBmdW5jdGlvbiBoYW5kbGVJbXBvcnRzKG5vZGUpIHtcbiAgICAgICAgbGV0IGRpc3BsYXlOYW1lO1xuICAgICAgICBsZXQgdmFsdWU7XG4gICAgICAgIGxldCB0eXBlO1xuICAgICAgICAvLyBza2lwIFwiZXhwb3J0IGltcG9ydFwic1xuICAgICAgICBpZiAobm9kZS5pc0V4cG9ydCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAobm9kZS5tb2R1bGVSZWZlcmVuY2UudHlwZSA9PT0gJ1RTRXh0ZXJuYWxNb2R1bGVSZWZlcmVuY2UnKSB7XG4gICAgICAgICAgdmFsdWUgPSBub2RlLm1vZHVsZVJlZmVyZW5jZS5leHByZXNzaW9uLnZhbHVlO1xuICAgICAgICAgIGRpc3BsYXlOYW1lID0gdmFsdWU7XG4gICAgICAgICAgdHlwZSA9ICdpbXBvcnQnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlID0gJyc7XG4gICAgICAgICAgZGlzcGxheU5hbWUgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKS5nZXRUZXh0KG5vZGUubW9kdWxlUmVmZXJlbmNlKTtcbiAgICAgICAgICB0eXBlID0gJ2ltcG9ydDpvYmplY3QnO1xuICAgICAgICB9XG4gICAgICAgIHJlZ2lzdGVyTm9kZShcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgIGRpc3BsYXlOYW1lLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJhbmtzLFxuICAgICAgICAgIGdldEJsb2NrSW1wb3J0cyhub2RlLnBhcmVudCksXG4gICAgICAgICAgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMsXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgQ2FsbEV4cHJlc3Npb246IGZ1bmN0aW9uIGhhbmRsZVJlcXVpcmVzKG5vZGUpIHtcbiAgICAgICAgaWYgKCFpc1N0YXRpY1JlcXVpcmUobm9kZSkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmxvY2sgPSBnZXRSZXF1aXJlQmxvY2sobm9kZSk7XG4gICAgICAgIGlmICghYmxvY2spIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmFtZSA9IG5vZGUuYXJndW1lbnRzWzBdLnZhbHVlO1xuICAgICAgICByZWdpc3Rlck5vZGUoXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgdmFsdWU6IG5hbWUsXG4gICAgICAgICAgICBkaXNwbGF5TmFtZTogbmFtZSxcbiAgICAgICAgICAgIHR5cGU6ICdyZXF1aXJlJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJhbmtzLFxuICAgICAgICAgIGdldEJsb2NrSW1wb3J0cyhibG9jayksXG4gICAgICAgICAgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMsXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgJ1Byb2dyYW06ZXhpdCc6IGZ1bmN0aW9uIHJlcG9ydEFuZFJlc2V0KCkge1xuICAgICAgICBpbXBvcnRNYXAuZm9yRWFjaCgoaW1wb3J0ZWQpID0+IHtcbiAgICAgICAgICBpZiAobmV3bGluZXNCZXR3ZWVuSW1wb3J0cyAhPT0gJ2lnbm9yZScpIHtcbiAgICAgICAgICAgIG1ha2VOZXdsaW5lc0JldHdlZW5SZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQsIG5ld2xpbmVzQmV0d2VlbkltcG9ydHMsIGRpc3RpbmN0R3JvdXApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhbHBoYWJldGl6ZS5vcmRlciAhPT0gJ2lnbm9yZScpIHtcbiAgICAgICAgICAgIG11dGF0ZVJhbmtzVG9BbHBoYWJldGl6ZShpbXBvcnRlZCwgYWxwaGFiZXRpemUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG1ha2VPdXRPZk9yZGVyUmVwb3J0KGNvbnRleHQsIGltcG9ydGVkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaW1wb3J0TWFwLmNsZWFyKCk7XG4gICAgICB9LFxuICAgIH07XG4gIH0sXG59O1xuIl19