package utils

type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type PageResponse struct {
	List      interface{} `json:"list"`
	Total     int64       `json:"total"`
	Page      int         `json:"page"`
	PageSize  int         `json:"page_size"`
	TotalPage int64       `json:"total_page"`
}

func Success(data interface{}) APIResponse {
	return APIResponse{
		Code:    200,
		Message: "success",
		Data:    data,
	}
}

func SuccessMessage(message string) APIResponse {
	return APIResponse{
		Code:    200,
		Message: message,
	}
}

func Error(code int, message string) APIResponse {
	return APIResponse{
		Code:    code,
		Message: message,
	}
}

func BadRequest(message string) APIResponse {
	return Error(400, message)
}

func Unauthorized(message string) APIResponse {
	return Error(401, message)
}

func Forbidden(message string) APIResponse {
	return Error(403, message)
}

func NotFound(message string) APIResponse {
	return Error(404, message)
}

func InternalError(message string) APIResponse {
	return Error(500, message)
}

func Page(list interface{}, total int64, page, pageSize int) PageResponse {
	totalPage := total / int64(pageSize)
	if total%int64(pageSize) != 0 {
		totalPage++
	}
	return PageResponse{
		List:      list,
		Total:     total,
		Page:      page,
		PageSize:  pageSize,
		TotalPage: totalPage,
	}
}
