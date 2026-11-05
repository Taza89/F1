<!DOCTYPE html>
<html lang="da">
    <head>
    <meta charset="UTF-8">
    <title>F1 Manager - Login & Dashboard</title>
<style>
    body { font-family: Arial, sans-serif; background: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .card { background: #1e1e1e; padding: 25px; border-radius: 8px; width: 350px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
    input { width: 100%; padding: 10px; margin: 8px 0; background: #2c2c2c; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; background: #e10600; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    button:hover { background: #ff1801; }
    .hidden { display: none; }
    .success { color: #4CAF50; margin-bottom: 10px; }
    .error { color: #f44336; margin-bottom: 10px; }
</style>
</head>
<body>

<div class="card">
    <div id="auth-section">
        <h2>F1 Manager</h2>
        <div id="msg"></div>

        <h3>Opret Bruger / Hold</h3>
        <input type="text" id="reg-user" placeholder="Brugernavn">
            <input type="password" id="reg-pass" placeholder="Adgangskode">
                <input type="text" id="reg-team" placeholder="F1 Holdnavn (f.eks. Sydvestjysk F1)">
                    <button onclick="register()">Opret hold</button>

                    <hr style="border: 0; border-top: 1px solid #444; margin: 20px 0;">

                        <h3>Login</h3>
                        <input type="text" id="login-user" placeholder="Brugernavn">
                            <input type="password" id="login-pass" placeholder="Adgangskode">
                                <button onclick="login()">Log ind</button>
    </div>

    <div id="dashboard-section" class="hidden">
        <h2>Mit F1 Hold</h2>
        <div id="team-info">Henter data...</div>
        <button onclick="logout()" style="background: #444;">Log ud</button>
    </div>
</div>

<script src="app.js"></script>
</body>
</html>