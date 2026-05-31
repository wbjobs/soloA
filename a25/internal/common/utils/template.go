package utils

import (
	"bytes"
	"strings"
	"text/template"
)

type TemplateEngine struct {
}

func NewTemplateEngine() *TemplateEngine {
	return &TemplateEngine{}
}

func (t *TemplateEngine) Render(templateStr string, params map[string]interface{}) (string, error) {
	tmpl, err := template.New("message").Parse(templateStr)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	err = tmpl.Execute(&buf, params)
	if err != nil {
		return "", err
	}

	return buf.String(), nil
}

func (t *TemplateEngine) ExtractVariables(templateStr string) []string {
	variables := make([]string, 0)
	inVariable := false
	varName := ""

	for _, char := range templateStr {
		if char == '{' {
			inVariable = true
			varName = ""
		} else if char == '}' && inVariable {
			if varName != "" && !strings.Contains(varName, ".") {
				variables = append(variables, varName)
			}
			inVariable = false
			varName = ""
		} else if inVariable && char != '{' {
			varName += string(char)
		}
	}

	return unique(variables)
}

func unique(slice []string) []string {
	keys := make(map[string]bool)
	list := []string{}
	for _, entry := range slice {
		if _, value := keys[entry]; !value {
			keys[entry] = true
			list = append(list, entry)
		}
	}
	return list
}

func SimpleReplace(content string, params map[string]interface{}) string {
	for key, value := range params {
		placeholder := "{{." + key + "}}"
		content = strings.ReplaceAll(content, placeholder, convertToString(value))
	}
	return content
}

func convertToString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case int, int64, int32, int16, int8:
		return Int64ToString(val.(int64))
	case float64, float32:
		return Int64ToString(int64(val.(float64)))
	case bool:
		if val {
			return "true"
		}
		return "false"
	default:
		return ToJSON(v)
	}
}
