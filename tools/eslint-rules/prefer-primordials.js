/**
 * @fileoverview We shouldn't use global built-in object for security and
 *               performance reason. This linter rule reports replaceable codes
 *               that can be replaced with primordials.
 * @author Leko <leko.noor@gmail.com>
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

function toPrimordialsName(obj, prop) {
  return obj + toUcFirst(prop);
}

function toUcFirst(str) {
  return str[0].toUpperCase() + str.slice(1);
}

function isTarget(map, varName) {
  return map.has(varName);
}

function isIgnored(map, varName, propName) {
  return map.get(varName)?.get(propName)?.ignored ?? false;
}

function getReportName({ name, parentName, into }) {
  if (into) {
    return toPrimordialsName(into, name);
  }
  if (parentName) {
    return toPrimordialsName(parentName, name);
  }
  return name;
}

/**
 * Get identifier of object spread assignment
 *
 * code: 'const { ownKeys } = Reflect;'
 * argument: 'ownKeys'
 * return: 'Reflect'
 */
function getDestructuringAssignmentParent(scope, node) {
  const declaration = scope.set.get(node.name);
  if (
    !declaration ||
    !declaration.defs ||
    declaration.defs.length === 0 ||
    declaration.defs[0].type !== 'Variable' ||
    !declaration.defs[0].node.init
  ) {
    return null;
  }
  return declaration.defs[0].node.init;
}

const identifierSelector =
  '[type!=VariableDeclarator][type!=MemberExpression]>Identifier';

module.exports = {
  meta: {
    messages: {
      error: 'Use `const { {{name}} } = primordials;` instead of the global.'
    }
  },
  create(context) {
    const globalScope = context.getSourceCode().scopeManager.globalScope;

    const nameMap = new Map();
    const renameMap = new Map();

    for (const option of context.options) {
      const names = option.ignore || [];
      nameMap.set(
        option.name,
        new Map(names.map((name) => [name, { ignored: true }]))
      );
      if (option.into) {
        renameMap.set(option.name, option.into);
      }
    }

    let reported;

    return {
      Program() {
        reported = new Set();
      },
      [identifierSelector](node) {
        if (reported.has(node.range[0])) {
          return;
        }
        const name = node.name;
        const parent = getDestructuringAssignmentParent(
          context.getScope(),
          node
        );
        const parentName = parent?.name;
        if (!isTarget(nameMap, name) && !isTarget(nameMap, parentName)) {
          return;
        }

        const defs = globalScope.set.get(name)?.defs;
        if (parentName && isTarget(nameMap, parentName)) {
          if (defs?.[0].name.name !== 'primordials' &&
              !reported.has(parent.range[0]) &&
              parent.parent?.id?.type !== 'Identifier') {
            reported.add(node.range[0]);
            const into = renameMap.get(name);
            context.report({
              node,
              messageId: 'error',
              data: {
                name: getReportName({ into, parentName, name })
              }
            });
          }
          return;
        }
        if (defs.length === 0 || defs[0].node.init.name !== 'primordials') {
          reported.add(node.range[0]);
          const into = renameMap.get(name);
          context.report({
            node,
            messageId: 'error',
            data: {
              name: getReportName({ into, parentName, name })
            }
          });
        }
      },
      MemberExpression(node) {
        const obj = node.object.name;
        const prop = node.property.name;
        if (!prop || !isTarget(nameMap, obj) || isIgnored(nameMap, obj, prop)) {
          return;
        }

        const variables =
          context.getSourceCode().scopeManager.getDeclaredVariables(node);
        if (variables.length === 0) {
          context.report({
            node,
            messageId: 'error',
            data: {
              name: toPrimordialsName(obj, prop),
            }
          });
        }
      },
      VariableDeclarator(node) {
        const name = node.init?.name;
        if (name !== undefined && isTarget(nameMap, name) &&
            node.id.type === 'Identifier' &&
            !globalScope.set.get(name)?.defs.length) {
          reported.add(node.init.range[0]);
          context.report({
            node,
            messageId: 'error',
            data: { name },
          });
        }
      },
    };
  }
};
