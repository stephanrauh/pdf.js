module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const privateMethods = new Map();

  // Find all private methods and replace them with a new identifier
  root.find(j.MethodDefinition, { kind: 'method', key: { type: 'PrivateName' } }).forEach(path => {
    const privateName = path.node.key.id.name;
    const publicName = '__' + privateName;
    privateMethods.set(privateName, publicName);

    path.node.key.type = 'Identifier';
    path.node.key.name = publicName;
  });

  // Find all private properties and replace them with a new identifier
  root.find(j.ClassProperty, { key: { type: 'PrivateName' } }).forEach(path => {
    const privateName = path.node.key.id.name;
    const publicName = '__' + privateName;
    privateMethods.set(privateName, publicName);

    path.node.key.type = 'Identifier';
    path.node.key.name = publicName;
  });

  // Find all private properties and method expressions and replace them with a new identifier
  root.find(j.MemberExpression, { property: { type: 'PrivateName' } }).forEach(path => {
    const privateName = path.node.property.id.name;
    const publicName = privateMethods.get(privateName);
    if (!publicName) return;
    
    path.node.property = publicName;
  });

  return root.toSource();
}
