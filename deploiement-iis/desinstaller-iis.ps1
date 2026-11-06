<#
  desinstaller-iis.ps1 : retire Horizon Ouest d'IIS (site, pool, tache du serveur Python).
  A lancer en administrateur :  powershell -ExecutionPolicy Bypass -File .\desinstaller-iis.ps1
  Le dossier C:\inetpub\horizon-ouest est conserve (il contient les messages recus) :
  supprimez-le vous-meme apres avoir recupere ce qui vous interesse.
  Les modules URL Rewrite et ARR ne sont pas desinstalles.
#>
param([string]$Destination = "C:\inetpub\horizon-ouest")
$appcmd = "$env:windir\System32\inetsrv\appcmd.exe"
$NomTache = "Horizon Ouest - serveur Python"

Stop-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tache du serveur Python retiree."
& $appcmd delete site "Horizon Ouest" 2>$null | Out-Null
& $appcmd delete apppool "HorizonOuest" 2>$null | Out-Null
Write-Host "Site et pool IIS retires."
Write-Host "Dossier conserve : $Destination (messages : backend\suggestions.jsonl)."
