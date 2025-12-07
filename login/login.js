document.addEventListener('DOMContentLoaded', () => {
  // === CONFIGURAÇÃO DE CREDENCIAIS ===
  const VALID_USER = "admin";
  const VALID_PASS = "admin123";

  // Elementos DOM
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const togglePassword = document.getElementById('togglePassword');
  const loginButton = document.getElementById('loginButton');
  const usernameValidation = document.getElementById('usernameValidation');
  const passwordValidation = document.getElementById('passwordValidation');
  const toggleTheme = document.getElementById('toggleTheme');
  const loginCard = document.getElementById('loginCard');

  // Validação em tempo real (Visual apenas)
  if(usernameInput) {
    usernameInput.addEventListener('input', () => {
      validateField(usernameInput, usernameValidation, 'Usuário deve ter pelo menos 3 caracteres');
    });
  }

  if(passwordInput) {
    passwordInput.addEventListener('input', () => {
      validateField(passwordInput, passwordValidation, 'Senha deve ter pelo menos 6 caracteres');
    });
  }

  // Alternar visibilidade da senha
  if(togglePassword) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePassword.innerHTML = type === 'password' 
        ? '<i class="fa-solid fa-eye"></i>' 
        : '<i class="fa-solid fa-eye-slash"></i>';
    });
  }

  // Alternar tema
  if(toggleTheme) {
    toggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      const icon = toggleTheme.querySelector('i');
      icon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
  }

  // Aplicar tema salvo
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (toggleTheme) {
    const icon = toggleTheme.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  // Processar formulário de login (LÓGICA REAL)
  if(loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const userValue = usernameInput.value.trim();
      const passValue = passwordInput.value.trim();
      
      // Simular carregamento
      loginButton.disabled = true;
      loginButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Verificando...</span>';
      
      setTimeout(() => {
        // VERIFICAÇÃO DE LOGIN
        if (userValue === VALID_USER && passValue === VALID_PASS) {
            // Sucesso: Salva sessão e redireciona
            localStorage.setItem('maintControl_session', 'true');
            localStorage.setItem('maintControl_user', userValue);
            
            // Redireciona para a raiz (sai da pasta login)
            window.location.href = '../index.html'; 
        } else {
            // Erro: Senha incorreta
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Entrar</span>';

            // Efeito de shake
            if(loginCard) {
                loginCard.classList.add('shake');
                setTimeout(() => { loginCard.classList.remove('shake'); }, 500);
            }

            // Mensagem de erro
            passwordValidation.classList.add('show', 'invalid');
            passwordValidation.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>Usuário ou senha incorretos</span>`;
        }
      }, 1000);
    });
  }

  // Função auxiliar de validação visual
  function validateField(input, validationEl, errorMessage) {
    const value = input.value.trim();
    const minLength = (input.type === 'password' ? 6 : 3);
    const isValid = value.length >= minLength;
    
    if (value.length === 0) {
      validationEl.classList.remove('show', 'valid', 'invalid');
      validationEl.innerHTML = '';
    } else {
      validationEl.classList.add('show');
      if (isValid) {
        validationEl.classList.add('valid');
        validationEl.classList.remove('invalid');
        validationEl.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Formato válido</span>';
      } else {
        validationEl.classList.add('invalid');
        validationEl.classList.remove('valid');
        validationEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${errorMessage}</span>`;
      }
    }
    return isValid;
  }
});