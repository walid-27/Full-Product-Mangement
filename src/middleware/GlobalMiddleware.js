
    function GlobalMiddleware(err, req, res, next){
        if(err.statusCode){
            return res.status(err.statusCode).json({message: err.message})
        }

        if(err.name === "ValidationError"){
            const errors = {}

            for(const fields in err.errors){
                errors[fields] = err.errors[fields].message
            }

            return res.status(400).json({ message: errors})
        }


        if(err.name === "CastError"){
           return  res.status(400).json({
            message: "error in Search"
           })
        }

        return res.status(500).json({message: err.message})
    }

    module.exports = GlobalMiddleware