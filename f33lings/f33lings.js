(function loadF33lingsProject() {
  const scripts = [
    '../data/foundation-aspects.js',
    '../pretext.js',
    'w_structure.js',
    'x_state.js',
    'y_relation.js',
    'z_output.js',
  ];

  const base = new URL('./', document.currentScript.src);

  // Preserve router architecture while improving startup performance:
  // - inject all children immediately for parallel fetch
  // - enforce execution order with async=false
  for (const relPath of scripts) {
    const script = document.createElement('script');
    script.src = new URL(relPath, base).toString();
    script.async = false;
    script.onerror = () => {
      throw new Error(`Failed to load f33lings script: ${relPath}`);
    };
    document.head.appendChild(script);
  }
})();
