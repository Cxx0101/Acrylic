// vue-loader 15 imports a default from ordinary <style> proxy modules.
// Those modules only re-export named bindings. An unused style import should
// instead be a side-effect import, which still runs CSS injection and HMR.
module.exports = function fixVueStyleImports(source) {
  const code = String(source);
  return code.replace(/import\s+(style\d+)\s+from\s+(["'])([^"'\n]+)\2\s*;?/g,
    (statement, binding, quote, request) => {
      if (!/[?&]type=style(?:&|$)/.test(request) || /[?&]module(?:[=&]|$)/.test(request)) return statement;
      // Keep CSS-module/SSR/shadow-root bindings when they are actually used.
      const uses = code.match(new RegExp('\\b' + binding + '\\b', 'g')) || [];
      return uses.length === 1 ? 'import ' + quote + request + quote + ';\n' : statement;
    });
};
