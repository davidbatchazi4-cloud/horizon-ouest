<#
  installer-iis.ps1 : deploie Horizon Ouest sur IIS (site + serveur Python derriere un proxy inverse).

  A lancer dans un PowerShell « Executer en tant qu'administrateur », depuis ce dossier :
      powershell -ExecutionPolicy Bypass -File .\installer-iis.ps1

  Prerequis (voir LISEZ-MOI-IIS.md) : IIS, URL Rewrite, Application Request Routing (ARR),
  et un Python installe « pour tous les utilisateurs ».

  Le script peut etre relance : il met le site a jour sans toucher aux messages recus
  ni au mot de passe administrateur.
#>
param(
    [string]$Destination = "C:\inetpub\horizon-ouest",
    [int]$PortSite = 8080,
    [int]$PortApi = 8001,
    [string]$Python = ""
)
$ErrorActionPreference = "Stop"
$NomSite = "Horizon Ouest"
$NomPool = "HorizonOuest"
$NomTache = "Horizon Ouest - serveur Python"
$Source = Split-Path $PSScriptRoot -Parent
$inetsrv = "$env:windir\System32\inetsrv"
$appcmd = "$inetsrv\appcmd.exe"

function Etape($texte) { Write-Host "`n==> $texte" -ForegroundColor Cyan }
function Echec($texte) { Write-Host "`nERREUR : $texte" -ForegroundColor Red; exit 1 }

# ---------- 0. Verifications ----------
Etape "Verification des prerequis"
$estAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdmin) { Echec "lancez ce script dans un PowerShell ouvert avec « Executer en tant qu'administrateur »." }
if (-not (Test-Path $appcmd)) { Echec "IIS n'est pas installe (appcmd.exe introuvable)." }
if (-not (Test-Path "$inetsrv\rewrite.dll")) { Echec "le module URL Rewrite n'est pas installe (voir LISEZ-MOI-IIS.md, etape 1)." }
if (-not (Test-Path "$env:ProgramFiles\IIS\Application Request Routing")) { Echec "le module ARR n'est pas installe (voir LISEZ-MOI-IIS.md, etape 2)." }

if (-not $Python) {
    # Python de python.org : d'abord « pour tous les utilisateurs » (C:\Program Files\Python3xx),
    # sinon l'installation pour ce compte (AppData\Local\Programs\Python\Python3xx). Le plus recent.
    $Python = Get-ChildItem "$env:ProgramFiles\Python3*\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" `
        -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Python -or -not (Test-Path $Python)) {
    Echec "Python (python.org) introuvable (voir LISEZ-MOI-IIS.md, etape 3), ou passez -Python <chemin\python.exe>."
}
if ($Python -like "*WindowsApps*") { Echec "le Python du Microsoft Store ne peut pas etre utilise par un service : installez Python depuis python.org." }
Write-Host "   Python : $Python"
Write-Host "   Source : $Source"
Write-Host "   Destination : $Destination"

$occupe = Get-NetTCPConnection -LocalPort $PortSite -State Listen -ErrorAction SilentlyContinue
$siteExiste = (& $appcmd list site /name:"$NomSite") -ne $null
if ($occupe -and -not $siteExiste) { Echec "le port $PortSite est deja utilise par un autre programme. Relancez avec -PortSite 8090 par exemple." }

# ---------- 1. Copie des fichiers ----------
Etape "Copie du site dans $Destination"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
# /MIR : copie miroir. Les fichiers exclus (/XF) ne sont jamais effaces dans la destination :
# les messages recus et le mot de passe administrateur survivent aux mises a jour.
robocopy $Source $Destination /MIR /NFL /NDL /NJH /NJS /NP `
    /XD .git __pycache__ .pytest_cache propositions-logo deploiement-iis `
    /XF suggestions.jsonl suggestions.tmp mot_de_passe_admin.txt web.config lancer.bat "Capture*" | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "la copie (robocopy) a echoue, code $LASTEXITCODE." }
Copy-Item "$PSScriptRoot\web.config" "$Destination\web.config" -Force
Write-Host "   Fichiers copies."

# ---------- 2. Dependances Python ----------
Etape "Installation des bibliotheques Python (FastAPI, uvicorn, httpx)"
& $Python -m pip install --quiet --disable-pip-version-check -r "$Destination\backend\requirements.txt"
if ($LASTEXITCODE -ne 0) { Echec "pip install a echoue." }

# ---------- 3. Pool d'applications et site IIS ----------
Etape "Configuration d'IIS"
if (-not (& $appcmd list apppool /name:$NomPool)) {
    & $appcmd add apppool /name:$NomPool /managedRuntimeVersion:"" | Out-Null   # fichiers statiques : pas de .NET
}
if (-not $siteExiste) {
    & $appcmd add site /name:"$NomSite" /physicalPath:"$Destination" /bindings:"http/*:${PortSite}:" | Out-Null
}
& $appcmd set app "$NomSite/" /applicationPool:$NomPool | Out-Null
& $appcmd set site "$NomSite" /bindings:"http/*:${PortSite}:" | Out-Null
# Active le proxy d'ARR (au niveau du serveur) : indispensable pour transmettre /api a FastAPI.
& $appcmd set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /commit:apphost | Out-Null
& $appcmd start site "$NomSite" | Out-Null
Write-Host "   Site « $NomSite » sur le port $PortSite."

# ---------- 4. Serveur Python lance au demarrage de Windows ----------
Etape "Serveur Python (tache planifiee au demarrage)"
$action = New-ScheduledTaskAction -Execute $Python `
    -Argument "-m uvicorn backend.main:app --host 127.0.0.1 --port $PortApi" -WorkingDirectory $Destination
$declencheur = New-ScheduledTaskTrigger -AtStartup
$compte = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$reglages = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Stop-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $NomTache -Action $action -Trigger $declencheur -Principal $compte `
    -Settings $reglages -Force | Out-Null
Start-ScheduledTask -TaskName $NomTache
Write-Host "   Serveur lance sur 127.0.0.1:$PortApi (accessible seulement via IIS)."

# ---------- 5. Verification ----------
Etape "Verification"
$ok = $false
foreach ($i in 1..15) {
    Start-Sleep -Seconds 2
    try {
        $sante = Invoke-RestMethod "http://localhost:$PortSite/api/sante" -TimeoutSec 5
        if ($sante.statut -eq "ok") { $ok = $true; break }
    } catch { }
}
$page = try { (Invoke-WebRequest "http://localhost:$PortSite/" -UseBasicParsing -TimeoutSec 10).StatusCode } catch { "erreur" }
$secret = try { (Invoke-WebRequest "http://localhost:$PortSite/backend/main.py" -UseBasicParsing -TimeoutSec 10).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
Write-Host "   Page d'accueil servie par IIS : $page"
Write-Host "   API Python via le proxy : $(if ($ok) { 'OK' } else { 'pas de reponse' })"
Write-Host "   Dossier backend protege : $(if ($secret -eq 404) { 'oui (404)' } else { "ATTENTION, code $secret" })"

if ($ok -and $page -eq 200) {
    Write-Host "`nHorizon Ouest est deploye sur IIS : http://localhost:$PortSite/" -ForegroundColor Green
    Write-Host "Espace administrateur : http://localhost:$PortSite/admin.html"
    Write-Host "Mot de passe : $Destination\backend\mot_de_passe_admin.txt (cree a la premiere connexion)."
} else {
    Write-Host "`nLe site est installe mais un controle a echoue : voir la section Depannage de LISEZ-MOI-IIS.md." -ForegroundColor Yellow
}
