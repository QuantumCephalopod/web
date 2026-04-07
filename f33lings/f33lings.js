(function loadF33lingsProject() {
  const scripts = [
    '../data/foundation-aspects.js',
    'w_structure.js',
    'x_state.js',
    'y_relation.js',
    'z_output.js',
  ];

  const base = new URL('./', document.currentScript.src);

  function loadAt(index) {
    if (index >= scripts.length) return;

    const script = document.createElement('script');
    script.src = new URL(scripts[index], base).toString();
    script.onload = () => loadAt(index + 1);
    script.onerror = () => {
      throw new Error(`Failed to load f33lings script: ${scripts[index]}`);
    };

    document.head.appendChild(script);
  }

  loadAt(0);
})();
