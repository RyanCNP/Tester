const spinner = document.getElementById('spinner');
const mensagem = document.getElementById('mensagem');

function simularProcesso() {
    mensagem.textContent = '';
    spinner.classList.add('active'); // liga o interruptor
    mensagem.textContent = 'Processando...';

    // Simula um tempo de espera (como se fosse uma requisição)
    setTimeout(() => {
        spinner.classList.remove('active'); // desliga o interruptor
        mensagem.textContent = 'Processo concluído com êxito.';
    }, 3000); // tempo de “carregamento”
}