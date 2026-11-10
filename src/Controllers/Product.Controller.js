const ProductServices = require("../Services/Product.Service");
const AppError = require("../utils/AppError");



    const createProduct = async(req, res, next )=>{

        try{
            const Product = await ProductServices.createProduct(req.body, req.file, req.user.userId);


            res.status(201).json({
                product: Product
            })
                 

        }catch(err){
            if (err.code === 11000) {
                return next(new AppError("Product already exists", 409));
            }
            return next(err);
        }
       
    }

    const getProduct = async(req, res, next)=>{

        try{
            const Prdcts = await ProductServices.getProduct(req.user.userId, req.query.search, req.query.category, req.query.page, req.query.limit, req.query.sort)

            return res.status(200).json(Prdcts)
        }catch(err){
            next(err)
        }
    }

         const updateProduct = async(req, res, next)=>{
         try{
            const updatePrdct = await ProductServices.updateProduct(req.body, req.file, req.params.id, req.user.userId)

            return res.status(200).json(updatePrdct)
        }catch(err){
            next(err)
        }
    }


    const deleteProduct = async(req, res, next)=>{
        try{
            const deletePrdct = await ProductServices.deleteProduct(req.params.id, req.user.userId)

            return res.status(200).json(deletePrdct)
        }catch(err){
            next(err)
        }
    }

    const analysisProducts =async(req,res, next)=>{
        try{
            const analysisPrdcts = await ProductServices.analysisProducts(req.user.userId)
            return res.status(200).json(analysisPrdcts)
            }catch(err){
            next(err)
        }
    }
    module.exports = {
        createProduct,
        getProduct,
        updateProduct,
        deleteProduct,
        analysisProducts
    }