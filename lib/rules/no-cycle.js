'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}(); /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       * @fileOverview Ensures that no imported module imports the linted module.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       * @author Ben Mosher
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       */

var _resolve = require('eslint-module-utils/resolve');var _resolve2 = _interopRequireDefault(_resolve);
var _builder = require('../exportMap/builder');var _builder2 = _interopRequireDefault(_builder);
var _importType = require('../core/importType');
var _moduleVisitor = require('eslint-module-utils/moduleVisitor');var _moduleVisitor2 = _interopRequireDefault(_moduleVisitor);
var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}function _toConsumableArray(arr) {if (Array.isArray(arr)) {for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {arr2[i] = arr[i];}return arr2;} else {return Array.from(arr);}}

var traversed = new Set();

function routeString(route) {
  return route.map(function (s) {return String(s.value) + ':' + String(s.loc.start.line);}).join('=>');
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      category: 'Static analysis',
      description: 'Forbid a module from importing a module with a dependency path back to itself.',
      url: (0, _docsUrl2['default'])('no-cycle') },

    schema: [(0, _moduleVisitor.makeOptionsSchema)({
      maxDepth: {
        anyOf: [
        {
          description: 'maximum dependency depth to traverse',
          type: 'integer',
          minimum: 1 },

        {
          'enum': ['∞'],
          type: 'string' }] },



      ignoreExternal: {
        description: 'ignore external modules',
        type: 'boolean',
        'default': false },

      allowUnsafeDynamicCyclicDependency: {
        description: 'Allow cyclic dependency if there is at least one dynamic import in the chain',
        type: 'boolean',
        'default': false } })] },




  create: function () {function create(context) {
      var myPath = context.getPhysicalFilename ? context.getPhysicalFilename() : context.getFilename();
      if (myPath === '<text>') {return {};} // can't cycle-check a non-file

      var options = context.options[0] || {};
      var maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : Infinity;
      var ignoreModule = function () {function ignoreModule(name) {return options.ignoreExternal && (0, _importType.isExternalModule)(
          name,
          (0, _resolve2['default'])(name, context),
          context);}return ignoreModule;}();


      function checkSourceValue(sourceNode, importer) {
        if (ignoreModule(sourceNode.value)) {
          return; // ignore external modules
        }
        if (
        options.allowUnsafeDynamicCyclicDependency && (
        // Ignore `import()`
        importer.type === 'ImportExpression'
        // `require()` calls are always checked (if possible)
        || importer.type === 'CallExpression' && importer.callee.name !== 'require'))

        {
          return; // cycle via dynamic import allowed by config
        }

        if (
        importer.type === 'ImportDeclaration' && (
        // import type { Foo } (TS and Flow)
        importer.importKind === 'type'
        // import { type Foo } (Flow)
        || importer.specifiers.every(function (_ref) {var importKind = _ref.importKind;return importKind === 'type';})))

        {
          return; // ignore type imports
        }

        var imported = _builder2['default'].get(sourceNode.value, context);

        if (imported == null) {
          return; // no-unresolved territory
        }

        if (imported.path === myPath) {
          return; // no-self-import territory
        }

        var untraversed = [{ mget: function () {function mget() {return imported;}return mget;}(), route: [] }];
        function detectCycle(_ref2) {var mget = _ref2.mget,route = _ref2.route;
          var m = mget();
          if (m == null) {return;}
          if (traversed.has(m.path)) {return;}
          traversed.add(m.path);var _iteratorNormalCompletion = true;var _didIteratorError = false;var _iteratorError = undefined;try {

            for (var _iterator = m.imports[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {var _ref3 = _step.value;var _ref4 = _slicedToArray(_ref3, 2);var path = _ref4[0];var _ref4$ = _ref4[1];var getter = _ref4$.getter;var declarations = _ref4$.declarations;
              if (traversed.has(path)) {continue;}
              var toTraverse = [].concat(_toConsumableArray(declarations)).filter(function (_ref5) {var source = _ref5.source,isOnlyImportingTypes = _ref5.isOnlyImportingTypes;return !ignoreModule(source.value)
                // Ignore only type imports
                && !isOnlyImportingTypes;});


              /*
                                             If cyclic dependency is allowed via dynamic import, skip checking if any module is imported dynamically
                                             */
              if (options.allowUnsafeDynamicCyclicDependency && toTraverse.some(function (d) {return d.dynamic;})) {return;}

              /*
                                                                                                                             Only report as a cycle if there are any import declarations that are considered by
                                                                                                                             the rule. For example:
                                                                                                                              a.ts:
                                                                                                                             import { foo } from './b' // should not be reported as a cycle
                                                                                                                              b.ts:
                                                                                                                             import type { Bar } from './a'
                                                                                                                             */


              if (path === myPath && toTraverse.length > 0) {return true;}
              if (route.length + 1 < maxDepth) {var _iteratorNormalCompletion2 = true;var _didIteratorError2 = false;var _iteratorError2 = undefined;try {
                  for (var _iterator2 = toTraverse[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {var _ref6 = _step2.value;var source = _ref6.source;
                    untraversed.push({ mget: getter, route: route.concat(source) });
                  }} catch (err) {_didIteratorError2 = true;_iteratorError2 = err;} finally {try {if (!_iteratorNormalCompletion2 && _iterator2['return']) {_iterator2['return']();}} finally {if (_didIteratorError2) {throw _iteratorError2;}}}
              }
            }} catch (err) {_didIteratorError = true;_iteratorError = err;} finally {try {if (!_iteratorNormalCompletion && _iterator['return']) {_iterator['return']();}} finally {if (_didIteratorError) {throw _iteratorError;}}}
        }

        while (untraversed.length > 0) {
          var next = untraversed.shift(); // bfs!
          if (detectCycle(next)) {
            var message = next.route.length > 0 ? 'Dependency cycle via ' + String(
            routeString(next.route)) :
            'Dependency cycle detected.';
            context.report(importer, message);
            return;
          }
        }
      }

      return Object.assign((0, _moduleVisitor2['default'])(checkSourceValue, context.options[0]), {
        'Program:exit': function () {function ProgramExit() {
            traversed.clear();
          }return ProgramExit;}() });

    }return create;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby1jeWNsZS5qcyJdLCJuYW1lcyI6WyJ0cmF2ZXJzZWQiLCJTZXQiLCJyb3V0ZVN0cmluZyIsInJvdXRlIiwibWFwIiwicyIsInZhbHVlIiwibG9jIiwic3RhcnQiLCJsaW5lIiwiam9pbiIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwidHlwZSIsImRvY3MiLCJjYXRlZ29yeSIsImRlc2NyaXB0aW9uIiwidXJsIiwic2NoZW1hIiwibWF4RGVwdGgiLCJhbnlPZiIsIm1pbmltdW0iLCJpZ25vcmVFeHRlcm5hbCIsImFsbG93VW5zYWZlRHluYW1pY0N5Y2xpY0RlcGVuZGVuY3kiLCJjcmVhdGUiLCJjb250ZXh0IiwibXlQYXRoIiwiZ2V0UGh5c2ljYWxGaWxlbmFtZSIsImdldEZpbGVuYW1lIiwib3B0aW9ucyIsIkluZmluaXR5IiwiaWdub3JlTW9kdWxlIiwibmFtZSIsImNoZWNrU291cmNlVmFsdWUiLCJzb3VyY2VOb2RlIiwiaW1wb3J0ZXIiLCJjYWxsZWUiLCJpbXBvcnRLaW5kIiwic3BlY2lmaWVycyIsImV2ZXJ5IiwiaW1wb3J0ZWQiLCJFeHBvcnRNYXBCdWlsZGVyIiwiZ2V0IiwicGF0aCIsInVudHJhdmVyc2VkIiwibWdldCIsImRldGVjdEN5Y2xlIiwibSIsImhhcyIsImFkZCIsImltcG9ydHMiLCJnZXR0ZXIiLCJkZWNsYXJhdGlvbnMiLCJ0b1RyYXZlcnNlIiwiZmlsdGVyIiwic291cmNlIiwiaXNPbmx5SW1wb3J0aW5nVHlwZXMiLCJzb21lIiwiZCIsImR5bmFtaWMiLCJsZW5ndGgiLCJwdXNoIiwiY29uY2F0IiwibmV4dCIsInNoaWZ0IiwibWVzc2FnZSIsInJlcG9ydCIsIk9iamVjdCIsImFzc2lnbiIsImNsZWFyIl0sIm1hcHBpbmdzIjoic29CQUFBOzs7OztBQUtBLHNEO0FBQ0EsK0M7QUFDQTtBQUNBLGtFO0FBQ0EscUM7O0FBRUEsSUFBTUEsWUFBWSxJQUFJQyxHQUFKLEVBQWxCOztBQUVBLFNBQVND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Q0FBeUJrQyxVQUF6QixtSUFBcUMsOEJBQXhCRSxNQUF3QixTQUF4QkEsTUFBd0I7QUFDbkNYLGdDQUFZaUIsSUFBWixDQUFpQixFQUFFaEIsTUFBTU0sTUFBUixFQUFnQmpELE9BQU9BLE1BQU00RCxNQUFOLENBQWFQLE1BQWIsQ0FBdkIsRUFBakI7QUFDRCxtQkFIOEI7QUFJaEM7QUFDRixhQWxDbUM7QUFtQ3JDOztBQUVELGVBQU9YLFlBQVlnQixNQUFaLEdBQXFCLENBQTVCLEVBQStCO0FBQzdCLGNBQU1HLE9BQU9uQixZQUFZb0IsS0FBWixFQUFiLENBRDZCLENBQ0s7QUFDbEMsY0FBSWxCLFlBQVlpQixJQUFaLENBQUosRUFBdUI7QUFDckIsZ0JBQU1FLFVBQVVGLEtBQUs3RCxLQUFMLENBQVcwRCxNQUFYLEdBQW9CLENBQXBCO0FBQ1kzRCx3QkFBWThELEtBQUs3RCxLQUFqQixDQURaO0FBRVosd0NBRko7QUFHQXVCLG9CQUFReUMsTUFBUixDQUFlL0IsUUFBZixFQUF5QjhCLE9BQXpCO0FBQ0E7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsYUFBT0UsT0FBT0MsTUFBUCxDQUFjLGdDQUFjbkMsZ0JBQWQsRUFBZ0NSLFFBQVFJLE9BQVIsQ0FBZ0IsQ0FBaEIsQ0FBaEMsQ0FBZCxFQUFtRTtBQUN4RSxzQkFEd0Usc0NBQ3ZEO0FBQ2Y5QixzQkFBVXNFLEtBQVY7QUFDRCxXQUh1RSx3QkFBbkUsQ0FBUDs7QUFLRCxLQTFJYyxtQkFBakIiLCJmaWxlIjoibm8tY3ljbGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgRW5zdXJlcyB0aGF0IG5vIGltcG9ydGVkIG1vZHVsZSBpbXBvcnRzIHRoZSBsaW50ZWQgbW9kdWxlLlxuICogQGF1dGhvciBCZW4gTW9zaGVyXG4gKi9cblxuaW1wb3J0IHJlc29sdmUgZnJvbSAnZXNsaW50LW1vZHVsZS11dGlscy9yZXNvbHZlJztcbmltcG9ydCBFeHBvcnRNYXBCdWlsZGVyIGZyb20gJy4uL2V4cG9ydE1hcC9idWlsZGVyJztcbmltcG9ydCB7IGlzRXh0ZXJuYWxNb2R1bGUgfSBmcm9tICcuLi9jb3JlL2ltcG9ydFR5cGUnO1xuaW1wb3J0IG1vZHVsZVZpc2l0b3IsIHsgbWFrZU9wdGlvbnNTY2hlbWEgfSBmcm9tICdlc2xpbnQtbW9kdWxlLXV0aWxzL21vZHVsZVZpc2l0b3InO1xuaW1wb3J0IGRvY3NVcmwgZnJvbSAnLi4vZG9jc1VybCc7XG5cbmNvbnN0IHRyYXZlcnNlZCA9IG5ldyBTZXQoKTtcblxuZnVuY3Rpb24gcm91dGVTdHJpbmcocm91dGUpIHtcbiAgcmV0dXJuIHJvdXRlLm1hcCgocykgPT4gYCR7cy52YWx1ZX06JHtzLmxvYy5zdGFydC5saW5lfWApLmpvaW4oJz0+Jyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtZXRhOiB7XG4gICAgdHlwZTogJ3N1Z2dlc3Rpb24nLFxuICAgIGRvY3M6IHtcbiAgICAgIGNhdGVnb3J5OiAnU3RhdGljIGFuYWx5c2lzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRm9yYmlkIGEgbW9kdWxlIGZyb20gaW1wb3J0aW5nIGEgbW9kdWxlIHdpdGggYSBkZXBlbmRlbmN5IHBhdGggYmFjayB0byBpdHNlbGYuJyxcbiAgICAgIHVybDogZG9jc1VybCgnbm8tY3ljbGUnKSxcbiAgICB9LFxuICAgIHNjaGVtYTogW21ha2VPcHRpb25zU2NoZW1hKHtcbiAgICAgIG1heERlcHRoOiB7XG4gICAgICAgIGFueU9mOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdtYXhpbXVtIGRlcGVuZGVuY3kgZGVwdGggdG8gdHJhdmVyc2UnLFxuICAgICAgICAgICAgdHlwZTogJ2ludGVnZXInLFxuICAgICAgICAgICAgbWluaW11bTogMSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGVudW06IFsn4oieJ10sXG4gICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIGlnbm9yZUV4dGVybmFsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnaWdub3JlIGV4dGVybmFsIG1vZHVsZXMnLFxuICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFsbG93VW5zYWZlRHluYW1pY0N5Y2xpY0RlcGVuZGVuY3k6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBjeWNsaWMgZGVwZW5kZW5jeSBpZiB0aGVyZSBpcyBhdCBsZWFzdCBvbmUgZHluYW1pYyBpbXBvcnQgaW4gdGhlIGNoYWluJyxcbiAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSldLFxuICB9LFxuXG4gIGNyZWF0ZShjb250ZXh0KSB7XG4gICAgY29uc3QgbXlQYXRoID0gY29udGV4dC5nZXRQaHlzaWNhbEZpbGVuYW1lID8gY29udGV4dC5nZXRQaHlzaWNhbEZpbGVuYW1lKCkgOiBjb250ZXh0LmdldEZpbGVuYW1lKCk7XG4gICAgaWYgKG15UGF0aCA9PT0gJzx0ZXh0PicpIHsgcmV0dXJuIHt9OyB9IC8vIGNhbid0IGN5Y2xlLWNoZWNrIGEgbm9uLWZpbGVcblxuICAgIGNvbnN0IG9wdGlvbnMgPSBjb250ZXh0Lm9wdGlvbnNbMF0gfHwge307XG4gICAgY29uc3QgbWF4RGVwdGggPSB0eXBlb2Ygb3B0aW9ucy5tYXhEZXB0aCA9PT0gJ251bWJlcicgPyBvcHRpb25zLm1heERlcHRoIDogSW5maW5pdHk7XG4gICAgY29uc3QgaWdub3JlTW9kdWxlID0gKG5hbWUpID0+IG9wdGlvbnMuaWdub3JlRXh0ZXJuYWwgJiYgaXNFeHRlcm5hbE1vZHVsZShcbiAgICAgIG5hbWUsXG4gICAgICByZXNvbHZlKG5hbWUsIGNvbnRleHQpLFxuICAgICAgY29udGV4dCxcbiAgICApO1xuXG4gICAgZnVuY3Rpb24gY2hlY2tTb3VyY2VWYWx1ZShzb3VyY2VOb2RlLCBpbXBvcnRlcikge1xuICAgICAgaWYgKGlnbm9yZU1vZHVsZShzb3VyY2VOb2RlLnZhbHVlKSkge1xuICAgICAgICByZXR1cm47IC8vIGlnbm9yZSBleHRlcm5hbCBtb2R1bGVzXG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIG9wdGlvbnMuYWxsb3dVbnNhZmVEeW5hbWljQ3ljbGljRGVwZW5kZW5jeSAmJiAoXG4gICAgICAgICAgLy8gSWdub3JlIGBpbXBvcnQoKWBcbiAgICAgICAgICBpbXBvcnRlci50eXBlID09PSAnSW1wb3J0RXhwcmVzc2lvbidcbiAgICAgICAgICAvLyBgcmVxdWlyZSgpYCBjYWxscyBhcmUgYWx3YXlzIGNoZWNrZWQgKGlmIHBvc3NpYmxlKVxuICAgICAgICAgIHx8IGltcG9ydGVyLnR5cGUgPT09ICdDYWxsRXhwcmVzc2lvbicgJiYgaW1wb3J0ZXIuY2FsbGVlLm5hbWUgIT09ICdyZXF1aXJlJ1xuICAgICAgICApXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuOyAvLyBjeWNsZSB2aWEgZHluYW1pYyBpbXBvcnQgYWxsb3dlZCBieSBjb25maWdcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBpbXBvcnRlci50eXBlID09PSAnSW1wb3J0RGVjbGFyYXRpb24nICYmIChcbiAgICAgICAgICAvLyBpbXBvcnQgdHlwZSB7IEZvbyB9IChUUyBhbmQgRmxvdylcbiAgICAgICAgICBpbXBvcnRlci5pbXBvcnRLaW5kID09PSAndHlwZSdcbiAgICAgICAgICAvLyBpbXBvcnQgeyB0eXBlIEZvbyB9IChGbG93KVxuICAgICAgICAgIHx8IGltcG9ydGVyLnNwZWNpZmllcnMuZXZlcnkoKHsgaW1wb3J0S2luZCB9KSA9PiBpbXBvcnRLaW5kID09PSAndHlwZScpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICByZXR1cm47IC8vIGlnbm9yZSB0eXBlIGltcG9ydHNcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW1wb3J0ZWQgPSBFeHBvcnRNYXBCdWlsZGVyLmdldChzb3VyY2VOb2RlLnZhbHVlLCBjb250ZXh0KTtcblxuICAgICAgaWYgKGltcG9ydGVkID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuOyAgLy8gbm8tdW5yZXNvbHZlZCB0ZXJyaXRvcnlcbiAgICAgIH1cblxuICAgICAgaWYgKGltcG9ydGVkLnBhdGggPT09IG15UGF0aCkge1xuICAgICAgICByZXR1cm47ICAvLyBuby1zZWxmLWltcG9ydCB0ZXJyaXRvcnlcbiAgICAgIH1cblxuICAgICAgY29uc3QgdW50cmF2ZXJzZWQgPSBbeyBtZ2V0OiAoKSA9PiBpbXBvcnRlZCwgcm91dGU6IFtdIH1dO1xuICAgICAgZnVuY3Rpb24gZGV0ZWN0Q3ljbGUoeyBtZ2V0LCByb3V0ZSB9KSB7XG4gICAgICAgIGNvbnN0IG0gPSBtZ2V0KCk7XG4gICAgICAgIGlmIChtID09IG51bGwpIHsgcmV0dXJuOyB9XG4gICAgICAgIGlmICh0cmF2ZXJzZWQuaGFzKG0ucGF0aCkpIHsgcmV0dXJuOyB9XG4gICAgICAgIHRyYXZlcnNlZC5hZGQobS5wYXRoKTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtwYXRoLCB7IGdldHRlciwgZGVjbGFyYXRpb25zIH1dIG9mIG0uaW1wb3J0cykge1xuICAgICAgICAgIGlmICh0cmF2ZXJzZWQuaGFzKHBhdGgpKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgY29uc3QgdG9UcmF2ZXJzZSA9IFsuLi5kZWNsYXJhdGlvbnNdLmZpbHRlcigoeyBzb3VyY2UsIGlzT25seUltcG9ydGluZ1R5cGVzIH0pID0+ICFpZ25vcmVNb2R1bGUoc291cmNlLnZhbHVlKVxuICAgICAgICAgICAgLy8gSWdub3JlIG9ubHkgdHlwZSBpbXBvcnRzXG4gICAgICAgICAgICAmJiAhaXNPbmx5SW1wb3J0aW5nVHlwZXMsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIC8qXG4gICAgICAgICAgSWYgY3ljbGljIGRlcGVuZGVuY3kgaXMgYWxsb3dlZCB2aWEgZHluYW1pYyBpbXBvcnQsIHNraXAgY2hlY2tpbmcgaWYgYW55IG1vZHVsZSBpcyBpbXBvcnRlZCBkeW5hbWljYWxseVxuICAgICAgICAgICovXG4gICAgICAgICAgaWYgKG9wdGlvbnMuYWxsb3dVbnNhZmVEeW5hbWljQ3ljbGljRGVwZW5kZW5jeSAmJiB0b1RyYXZlcnNlLnNvbWUoKGQpID0+IGQuZHluYW1pYykpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAvKlxuICAgICAgICAgIE9ubHkgcmVwb3J0IGFzIGEgY3ljbGUgaWYgdGhlcmUgYXJlIGFueSBpbXBvcnQgZGVjbGFyYXRpb25zIHRoYXQgYXJlIGNvbnNpZGVyZWQgYnlcbiAgICAgICAgICB0aGUgcnVsZS4gRm9yIGV4YW1wbGU6XG5cbiAgICAgICAgICBhLnRzOlxuICAgICAgICAgIGltcG9ydCB7IGZvbyB9IGZyb20gJy4vYicgLy8gc2hvdWxkIG5vdCBiZSByZXBvcnRlZCBhcyBhIGN5Y2xlXG5cbiAgICAgICAgICBiLnRzOlxuICAgICAgICAgIGltcG9ydCB0eXBlIHsgQmFyIH0gZnJvbSAnLi9hJ1xuICAgICAgICAgICovXG4gICAgICAgICAgaWYgKHBhdGggPT09IG15UGF0aCAmJiB0b1RyYXZlcnNlLmxlbmd0aCA+IDApIHsgcmV0dXJuIHRydWU7IH1cbiAgICAgICAgICBpZiAocm91dGUubGVuZ3RoICsgMSA8IG1heERlcHRoKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHsgc291cmNlIH0gb2YgdG9UcmF2ZXJzZSkge1xuICAgICAgICAgICAgICB1bnRyYXZlcnNlZC5wdXNoKHsgbWdldDogZ2V0dGVyLCByb3V0ZTogcm91dGUuY29uY2F0KHNvdXJjZSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHdoaWxlICh1bnRyYXZlcnNlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSB1bnRyYXZlcnNlZC5zaGlmdCgpOyAvLyBiZnMhXG4gICAgICAgIGlmIChkZXRlY3RDeWNsZShuZXh0KSkge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBuZXh0LnJvdXRlLmxlbmd0aCA+IDBcbiAgICAgICAgICAgID8gYERlcGVuZGVuY3kgY3ljbGUgdmlhICR7cm91dGVTdHJpbmcobmV4dC5yb3V0ZSl9YFxuICAgICAgICAgICAgOiAnRGVwZW5kZW5jeSBjeWNsZSBkZXRlY3RlZC4nO1xuICAgICAgICAgIGNvbnRleHQucmVwb3J0KGltcG9ydGVyLCBtZXNzYWdlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihtb2R1bGVWaXNpdG9yKGNoZWNrU291cmNlVmFsdWUsIGNvbnRleHQub3B0aW9uc1swXSksIHtcbiAgICAgICdQcm9ncmFtOmV4aXQnKCkge1xuICAgICAgICB0cmF2ZXJzZWQuY2xlYXIoKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0sXG59O1xuIl19