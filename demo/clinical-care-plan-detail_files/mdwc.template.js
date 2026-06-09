'use strict';

(function(_NS) {
  _NS.template = {
    render: function(tpl, data) {
      var re = /{{([^}}]+)?}}/g, reControlFlow = /(^#[if|for|else|end])(.*)?/g, reTemplate = /(^#render)(.*)?/g, code = 'var r=[];\n', cursor = 0, match;

      var add = function(line, isExpression) {
        if (!isExpression) {
          code += 'r.push("' + line.replace(/"/g, '\\"') + '");\n';
          return add;
        }

        if (line.match(reTemplate)) {
          code += 'r.push(' + 
            line
              .replace(/#/g, _NS.name + '.template.')
              .replace(/\(/g, '(document.querySelector(')
              .replace(/,/g, ').innerHTML, ')
              .replace(/\)$/g, '));') + '\n';
        } else if (line.match(reControlFlow)) {
          code += line
            .replace(/#/g, '')
            .replace(/\)$/g, '){')
            .replace(/else/g, '}else{')
            .replace(/^end.*/g, '}') + '\n';
        } else {
          code += 'r.push(' + line + ');\n';
        }
        return add;
      };

      while ((match = re.exec(tpl))) {
        add(tpl.slice(cursor, match.index))(match[1], true);
        cursor = match.index + match[0].length;
      }

      add(tpl.substring(cursor));
      code += 'return r.join("");';
      return new Function(code.replace(/[\r\t\n]/g, '')).apply(data);
    }
  };
})(MDWC);
