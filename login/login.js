
    document.addEventListener('DOMContentLoaded', () => {
      // Elementos DOM
      const loginForm = document.getElementById('loginForm');
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const togglePassword = document.getElementById('togglePassword');
      const loginButton = document.getElementById('loginButton');
      const usernameValidation = document.getElementById('usernameValidation');
      const passwordValidation = document.getElementById('passwordValidation');
      const toggleTheme = document.getElementById('toggleTheme');

      // Validação em tempo real
      usernameInput.addEventListener('input', () => {
        validateField(usernameInput, usernameValidation, 'Usuário deve ter pelo menos 3 caracteres');
      });

      passwordInput.addEventListener('input', () => {
        validateField(passwordInput, passwordValidation, 'Senha deve ter pelo menos 6 caracteres');
      });

      // Alternar visibilidade da senha
      togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' 
          ? '<i class="fa-solid fa-eye"></i>' 
          : '<i class="fa-solid fa-eye-slash"></i>';
      });

      // Alternar tema
      toggleTheme.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Atualizar ícone
        const icon = toggleTheme.querySelector('i');
        icon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      });

      // Aplicar tema salvo
      const savedTheme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', savedTheme);
      const icon = toggleTheme.querySelector('i');
      icon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

      // Processar formulário de login
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validar campos
        const isUsernameValid = validateField(usernameInput, usernameValidation, 'Usuário deve ter pelo menos 3 caracteres');
        const isPasswordValid = validateField(passwordInput, passwordValidation, 'Senha deve ter pelo menos 6 caracteres');
        
        if (isUsernameValid && isPasswordValid) {
          // Simular processo de login
          simulateLogin();
        } else {
          // Efeito de shake no formulário
          loginCard.classList.add('shake');
          setTimeout(() => {
            loginCard.classList.remove('shake');
          }, 500);
        }
      });

      // Função de validação de campo
      function validateField(input, validationEl, errorMessage) {
        const isValid = input.value.length >= (input.type === 'password' ? 6 : 3);
        
        if (input.value.length === 0) {
          validationEl.classList.remove('show', 'valid', 'invalid');
        } else {
          validationEl.classList.add('show');
          if (isValid) {
            validationEl.classList.add('valid');
            validationEl.classList.remove('invalid');
            validationEl.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Campo válido</span>';
          } else {
            validationEl.classList.add('invalid');
            validationEl.classList.remove('valid');
            validationEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${errorMessage}</span>`;
          }
        }
        
        return isValid;
      }

      // Simular processo de login
      function simulateLogin() {
        // Desabilitar botão e mostrar estado de carregamento
        loginButton.disabled = true;
        loginButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Entrando...</span>';
        
        // Simular requisição de API
        setTimeout(() => {
          // Aqui você faria a chamada real para sua API de autenticação
          // Por enquanto, vamos apenas simular um login bem-sucedido
          
          // Redirecionar para a página principal após login bem-sucedido
          window.location.href = '../index.html';
        }, 0);
      }
    });
    
  