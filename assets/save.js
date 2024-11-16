function saveFile(){
    const content = document.getElementById('content').innerHTML;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECB</title>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    
    <link rel="stylesheet" href="assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="assets/style.css">

    <link href="https://fonts.cdnfonts.com/css/media-gothic" rel="stylesheet">
    <link href="https://fonts.cdnfonts.com/css/rexmone-demo" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap" rel="stylesheet">

    <link rel="icon" href="assets/img/Logo.png" type="image/png">
</head>
<body>
${content}
 </body>
      <script src="assets/js/bootstrap.min.js"></script>
      <script type="text/javascript" src="assets/bar.js"></script>
      </html>`;
      const blob = new Blob([htmlContent],{
        type: 'text/html'
      });

      const link = document.getElementById('a');

      link.download = 'recipe.html';

      link.href = window.URL.createObjectURL(blob);

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);
}