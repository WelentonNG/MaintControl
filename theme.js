document.addEventListener('DOMContentLoaded', () => {

  const toggleTheme = document.getElementById('toggleTheme');
  if (toggleTheme) {
    toggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Atualizar ícone
      const icon = toggleTheme.querySelector('i');
      icon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
  }
  
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  if (toggleTheme) {
    const icon = toggleTheme.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
});