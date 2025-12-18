using GdUnit4;
using static GdUnit4.Assertions;
using Godot;
using System.Collections.Generic;

namespace WarYes.Tests.Integration
{
    [TestSuite]
    [RequireGodotRuntime]
    public class DataValidationTest
    {
        [TestCase]
        public void LoadAllUnits_NoExceptions()
        {
            // Act
            var units = DataLoader.LoadUnits();

            // Assert
            AssertInt(units.Count).IsGreater(0);
            foreach (var kvp in units)
            {
                AssertString(kvp.Value.Id).IsNotNull();
                // Ensure critical failure points like ModelPath are checked if we want strictness, 
                // but for now just success of LoadUnits is enough.
            }
        }

        [TestCase]
        public void LoadAllWeapons_NoExceptions()
        {
            // Act
            var weapons = DataLoader.LoadWeapons();

            // Assert
            AssertInt(weapons.Count).IsGreater(0);
        }

        [TestCase]
        public void VerifyUnitDependencies_WeaponsExist()
        {
            // Setup
            var units = DataLoader.LoadUnits();
            var weapons = DataLoader.LoadWeapons();

            // Act & Assert
            foreach (var unitKvp in units)
            {
                var unit = unitKvp.Value;
                if (unit.Weapons != null)
                {
                    foreach (var wData in unit.Weapons)
                    {
                        if (!string.IsNullOrEmpty(wData.WeaponId))
                        {
                            bool weaponExists = weapons.ContainsKey(wData.WeaponId);
                            if (!weaponExists)
                            {
                                // Fail with specific message
                                AssertBool(weaponExists)
                                    .OverrideFailureMessage($"Unit '{unit.Id}' references missing weapon '{wData.WeaponId}'")
                                    .IsTrue();
                            }
                        }
                    }
                }
            }
        }

        [TestCase]
        public void ValidateAllUnits_SchemaCompliance()
        {
            ValidateDirectoryAgainstSchema("units", "schemas/unit_stats.json");
        }

        [TestCase]
        public void ValidateAllWeapons_SchemaCompliance()
        {
            ValidateDirectoryAgainstSchema("weapons", "schemas/weapon_stats.json");
        }

        private void ValidateDirectoryAgainstSchema(string dataDirName, string schemaPathRel)
        {
            string projectPath = ProjectSettings.GlobalizePath("res://");
            string dataPath = System.IO.Path.GetFullPath(System.IO.Path.Combine(projectPath, $"../{dataDirName}"));
            string schemaPath = System.IO.Path.GetFullPath(System.IO.Path.Combine(projectPath, $"../{schemaPathRel}"));
            
            AssertBool(System.IO.File.Exists(schemaPath)).OverrideFailureMessage($"Schema not found at {schemaPath}").IsTrue();
            
            string schemaJson = System.IO.File.ReadAllText(schemaPath);
            using var schemaDoc = System.Text.Json.JsonDocument.Parse(schemaJson);
            var schemaRoot = schemaDoc.RootElement;
            
            // Basic Schema Parsing (Naive)
            var requiredProps = new HashSet<string>();
            if (schemaRoot.TryGetProperty("required", out var reqArray))
            {
                foreach(var req in reqArray.EnumerateArray())
                    requiredProps.Add(req.GetString());
            }

            foreach (string file in System.IO.Directory.EnumerateFiles(dataPath, "*.json", System.IO.SearchOption.AllDirectories))
            {
                string json = System.IO.File.ReadAllText(file);
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    
                    // 1. Check Required Properties
                    foreach(var req in requiredProps)
                    {
                        if (!root.TryGetProperty(req, out _))
                        {
                            AssertBool(false)
                                .OverrideFailureMessage($"File '{System.IO.Path.GetFileName(file)}' validation error: Missing required property '{req}'")
                                .IsTrue();
                        }
                    }
                    
                    // 2. Check Property Types (Recursive check would be better but simple top-level check for now)
                    if (schemaRoot.TryGetProperty("properties", out var props))
                    {
                        foreach(var prop in props.EnumerateObject())
                        {
                            string propName = prop.Name;
                            if (root.TryGetProperty(propName, out var val))
                            {
                                var schemaProp = prop.Value;
                                if (schemaProp.TryGetProperty("type", out var typeElem))
                                {
                                    bool typeMatch = false;
                                    string expectedTypeStats = "";

                                    if (typeElem.ValueKind == System.Text.Json.JsonValueKind.String)
                                    {
                                         string expectedType = typeElem.GetString();
                                         expectedTypeStats = expectedType;
                                         typeMatch = CheckTypeMatch(val.ValueKind, expectedType);
                                         
                                         // Special integer handling
                                         if (!typeMatch && expectedType == "integer" && val.ValueKind == System.Text.Json.JsonValueKind.Number) typeMatch = true;
                                    }
                                    else if (typeElem.ValueKind == System.Text.Json.JsonValueKind.Array)
                                    {
                                        expectedTypeStats = "one of: ";
                                        foreach(var t in typeElem.EnumerateArray())
                                        {
                                            string possibleType = t.GetString();
                                            expectedTypeStats += possibleType + ", ";
                                            if (CheckTypeMatch(val.ValueKind, possibleType)) { typeMatch = true; break; }
                                            if (possibleType == "integer" && val.ValueKind == System.Text.Json.JsonValueKind.Number) { typeMatch = true; break; }
                                        }
                                    }

                                    AssertBool(typeMatch)
                                        .OverrideFailureMessage($"File '{System.IO.Path.GetFileName(file)}' property '{propName}' type mismatch. Expected {expectedTypeStats}, got {val.ValueKind}")
                                        .IsTrue();
                                }
                            }
                        }
                    }
                }
                catch (System.Text.Json.JsonException e)
                {
                    AssertBool(false).OverrideFailureMessage($"File '{file}' is invalid JSON: {e.Message}").IsTrue();
                }
            }
        }
        
        private bool CheckTypeMatch(System.Text.Json.JsonValueKind kind, string schemaType)
        {
            return (kind, schemaType) switch
            {
                (System.Text.Json.JsonValueKind.String, "string") => true,
                (System.Text.Json.JsonValueKind.Number, "number") => true,
                (System.Text.Json.JsonValueKind.Number, "integer") => true, // Relaxed
                (System.Text.Json.JsonValueKind.True, "boolean") => true,
                (System.Text.Json.JsonValueKind.False, "boolean") => true,
                (System.Text.Json.JsonValueKind.Object, "object") => true,
                (System.Text.Json.JsonValueKind.Array, "array") => true,
                (System.Text.Json.JsonValueKind.Null, "null") => true, // Explicit null type
                _ => false
            };
        }
    }
}
