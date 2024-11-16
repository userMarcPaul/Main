function saveAsImage(){
    const content = document.getElementById('content');
    html2canvas(document.querySelector('#content'), {allowTaint: true, useCORS: true, scale:2,}).then(canvas => {const link = document.createElement('a');
        link.download = 'recipe.png';
        link.href = canvas.toDataURL('image/png');
        link.click;
    });
}