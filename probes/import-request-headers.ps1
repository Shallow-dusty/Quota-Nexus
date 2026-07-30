[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("opencode_go", "ollama_cloud")]
    [string]$Provider,

    [string]$CredentialsPath,

    [string]$NetworkProfile
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CredentialsPath)) {
    $CredentialsPath = Join-Path $PSScriptRoot "credentials.local.json"
}

function ConvertTo-OrderedDictionary {
    param([Parameter(ValueFromPipeline)]$InputObject)

    process {
        if ($null -eq $InputObject) {
            return $null
        }
        if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
            $result = [ordered]@{}
            foreach ($property in $InputObject.PSObject.Properties) {
                $result[$property.Name] = ConvertTo-OrderedDictionary $property.Value
            }
            return $result
        }
        if ($InputObject -is [System.Collections.IList] -and
            $InputObject -isnot [string]) {
            return @($InputObject | ForEach-Object {
                    ConvertTo-OrderedDictionary $_
                })
        }
        return $InputObject
    }
}

$expectedHost = switch ($Provider) {
    "opencode_go" { "opencode.ai" }
    "ollama_cloud" { "ollama.com" }
}

$clipboardText = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($clipboardText)) {
    throw "Clipboard is empty."
}

try {
    $requestPayload = $clipboardText | ConvertFrom-Json -ErrorAction Stop
}
catch {
    throw "Clipboard does not contain Firefox request headers JSON."
}

$headerRows = @($requestPayload.requestHeaders.headers)
$requestHost = ($headerRows |
        Where-Object { $_.name -ieq "Host" } |
        Select-Object -First 1).value
$cookieValue = ($headerRows |
        Where-Object { $_.name -ieq "Cookie" } |
        Select-Object -First 1).value

if ($requestHost -ne $expectedHost) {
    throw "Request host does not match Provider; expected $expectedHost."
}
if ([string]::IsNullOrWhiteSpace($cookieValue)) {
    throw "The request headers do not contain a Cookie."
}

if (Test-Path -LiteralPath $CredentialsPath) {
    try {
        $configObject = Get-Content -LiteralPath $CredentialsPath -Raw |
            ConvertFrom-Json -ErrorAction Stop
        $config = ConvertTo-OrderedDictionary $configObject
    }
    catch {
        throw "Existing credentials.local.json is invalid; no changes were written."
    }
}
else {
    $config = [ordered]@{
        network_profiles = [ordered]@{}
        clinepass = [ordered]@{
            api_key = ""
            network_profile = $null
        }
        opencode_go = [ordered]@{
            cookie = ""
            workspace_id = ""
            network_profile = $null
        }
        ollama_cloud = [ordered]@{
            cookie = ""
            network_profile = $null
        }
    }
}

if (-not $config.Contains($Provider) -or $null -eq $config[$Provider]) {
    $config[$Provider] = [ordered]@{}
}
$config[$Provider]["cookie"] = $cookieValue

if ($PSBoundParameters.ContainsKey("NetworkProfile")) {
    $config[$Provider]["network_profile"] =
        if ([string]::IsNullOrWhiteSpace($NetworkProfile)) { $null } else { $NetworkProfile }
}
elseif (-not $config[$Provider].Contains("network_profile")) {
    $config[$Provider]["network_profile"] = $null
}

if ($Provider -eq "opencode_go" -and -not $config[$Provider].Contains("workspace_id")) {
    $config[$Provider]["workspace_id"] = ""
}
if (-not $config.Contains("network_profiles")) {
    $config["network_profiles"] = [ordered]@{}
}

$destinationDirectory = Split-Path -Parent $CredentialsPath
if (-not (Test-Path -LiteralPath $destinationDirectory)) {
    throw "The credentials directory does not exist."
}

$json = $config | ConvertTo-Json -Depth 10
$tempPath = Join-Path $destinationDirectory (".credentials.local.{0}.tmp" -f [guid]::NewGuid())
try {
    [System.IO.File]::WriteAllText(
        $tempPath,
        $json + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $tempPath -Destination $CredentialsPath -Force
}
finally {
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force
    }
}

Write-Output "Updated $Provider credentials without echoing the Cookie."
