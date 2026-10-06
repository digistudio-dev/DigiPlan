// Applique le thème mémorisé avant le chargement de l'interface (évite un flash de couleur).
try {
  var theme = localStorage.getItem('digiplan.theme');
  if (theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    var splash = document.getElementById('splash');
    if (splash) splash.className = theme;
  }
} catch (e) {}
