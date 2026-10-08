// Corre antes do CSS para a pagina nunca pintar no tema errado.
// 'claro' | 'escuro' | 'sistema' (por omissao segue o Windows).
(function () {
  var escolha = 'sistema';
  try { escolha = localStorage.getItem('tema') || 'sistema'; } catch (e) { /* sem armazenamento */ }
  var escuro = escolha === 'escuro'
    || (escolha === 'sistema' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
})();
